import type { ApiClient } from '@askcalls/api-contract';
import { addKeyring, getKeyringEntry, listKeyring } from '@askcalls/api-contract/routes/keyring';
import {
  checkConfirmationGroups,
  createPasskeyEntry,
  createPassphraseEntry,
  createRecoveryEntry,
  fromUtf8,
  generateInboxKeyPair,
  generateRootKey,
  generateSigningKeyPair,
  isCryptoError,
  type KdfParams,
  PRF_SALT,
  pickConfirmationGroups,
  recoveryCodeGroups,
  UnlockedKeys,
  unlockWithDeviceSecret,
  unlockWithPasskey,
  unlockWithPassphrase,
  unlockWithRecoveryCode,
  wipeBytes,
} from '@askcalls/crypto';
import { DomainError } from '@askcalls/domain';
import type { DeviceKeyStore, PasskeyAuthenticator, SecretStore } from './ports/index';
import type { KeySession } from './session';

/** Inbox key pair version written at onboarding. */
export const INBOX_KEY_VERSION = 1;

/** Names of what the agent keeps in its SecretStore after linking (spec 6.5 step 5). */
export const DEVICE_SECRETS = {
  userId: 'user-id',
  deviceSecret: 'device-secret',
  wrappedRootKey: 'device-wrapped-root-key',
  kdfParams: 'device-kdf-params',
  deviceKeyId: 'device-key-id',
} as const;

type EntryKind = 'passkey' | 'recovery' | 'passphrase';

interface PendingEntry {
  kind: EntryKind;
  label: string;
  credentialId: string | null;
  wrappedRootKey: Uint8Array;
  kdfParams: KdfParams;
}

/**
 * Onboarding key setup (spec 6.2, 11.3). Generates RK on this device, prepares the unlock
 * methods locally, and uploads nothing until the recovery code is confirmed by retyping two
 * groups. `finish()` then uploads the keyring rows, the inbox key pair and this device's signing
 * key, and unlocks the session.
 */
export class Onboarding {
  readonly recoveryCode: string;
  /** 0-based group indices the user must retype. */
  readonly confirmationGroups: readonly [number, number];
  #rootKey: Uint8Array;
  #entries: PendingEntry[];
  #confirmed = false;
  #finished = false;

  private constructor(
    readonly userId: string,
    rootKey: Uint8Array,
    recovery: PendingEntry,
    code: string,
  ) {
    this.#rootKey = rootKey;
    this.#entries = [recovery];
    this.recoveryCode = code;
    this.confirmationGroups = pickConfirmationGroups();
  }

  static async begin(userId: string): Promise<Onboarding> {
    const rootKey = generateRootKey();
    const r = await createRecoveryEntry({ userId, rootKey });
    return new Onboarding(
      userId,
      rootKey,
      {
        kind: 'recovery',
        label: 'Recovery code',
        credentialId: null,
        wrappedRootKey: r.wrappedRootKey,
        kdfParams: r.kdfParams,
      },
      r.code,
    );
  }

  get recoveryGroups(): string[] {
    return recoveryCodeGroups(this.recoveryCode);
  }

  get confirmed(): boolean {
    return this.#confirmed;
  }

  /** Creates a passkey with PRF. Returns false (and adds nothing) when PRF is unsupported. */
  async addPasskey(authenticator: PasskeyAuthenticator, opts: { userName: string; label: string }) {
    this.#assertOpen();
    const created = await authenticator.create({ userName: opts.userName, prfSalt: PRF_SALT });
    if (!created.prfOutput) return false;
    try {
      const e = await createPasskeyEntry({
        userId: this.userId,
        rootKey: this.#rootKey,
        prfOutput: created.prfOutput,
      });
      this.#entries.push({
        kind: 'passkey',
        label: opts.label,
        credentialId: created.credentialId,
        wrappedRootKey: e.wrappedRootKey,
        kdfParams: e.kdfParams,
      });
      return true;
    } finally {
      wipeBytes(created.prfOutput);
    }
  }

  /** The fallback when PRF is missing (Argon2id; throws `weak_passphrase` under 12 characters). */
  async addPassphrase(passphrase: string, label = 'Passphrase'): Promise<void> {
    this.#assertOpen();
    const e = await createPassphraseEntry({
      userId: this.userId,
      rootKey: this.#rootKey,
      passphrase,
    });
    this.#entries.push({
      kind: 'passphrase',
      label,
      credentialId: null,
      wrappedRootKey: e.wrappedRootKey,
      kdfParams: e.kdfParams,
    });
  }

  /** `answers` maps each index in `confirmationGroups` to what the user typed. */
  confirmRecovery(answers: Record<number, string>): boolean {
    this.#assertOpen();
    const both = this.confirmationGroups.every((g) => answers[g] !== undefined);
    this.#confirmed =
      both &&
      checkConfirmationGroups(
        this.recoveryCode,
        Object.fromEntries(this.confirmationGroups.map((g) => [g, answers[g]!])),
      );
    return this.#confirmed;
  }

  async finish(opts: {
    api: ApiClient;
    session: KeySession;
    deviceKeys: DeviceKeyStore;
    deviceLabel: string;
  }): Promise<void> {
    this.#assertOpen();
    if (!this.#confirmed) {
      throw new DomainError('invalid', 'confirm the recovery code before finishing');
    }
    const keys = await UnlockedKeys.fromRootKey(this.#rootKey);
    try {
      for (const e of this.#entries) {
        await opts.api.request(addKeyring, {
          body: {
            type: 'entry',
            kind: e.kind,
            label: e.label,
            credentialId: e.credentialId,
            wrappedRootKey: e.wrappedRootKey,
            kdfParams: { ...e.kdfParams },
          },
        });
      }
      const inbox = await generateInboxKeyPair(keys.kek, this.userId);
      await opts.api.request(addKeyring, {
        body: {
          type: 'userKeys',
          inboxPublicKey: inbox.publicKey,
          inboxPrivateKeyCt: inbox.privateKeyCt,
          keyVersion: INBOX_KEY_VERSION,
        },
      });
      const device = await registerDevice(opts.api, opts.deviceKeys, opts.deviceLabel);
      await opts.session.unlock({ userId: this.userId, rootKey: this.#rootKey, device });
    } finally {
      keys.wipe();
      this.discard();
    }
    this.#finished = true;
  }

  /** Drops the RK and every prepared entry (cancel, or after `finish`). */
  discard(): void {
    wipeBytes(this.#rootKey);
    this.#entries = [];
    this.#finished = true;
  }

  #assertOpen(): void {
    if (this.#finished) throw new DomainError('conflict', 'onboarding already finished');
  }
}

/** Generates and registers this browser's signing key (session auth). */
export async function registerDevice(
  api: ApiClient,
  deviceKeys: DeviceKeyStore,
  label: string,
): Promise<{ deviceKeyId: string; privateKey: CryptoKey }> {
  const pair = await generateSigningKeyPair({ extractable: deviceKeys.extractable });
  const res = await api.request(addKeyring, {
    body: { type: 'device', label, signingPublicKey: pair.publicKey },
  });
  if (res.type !== 'device') throw new DomainError('provider_error', 'unexpected keyring response');
  await deviceKeys.save(res.device.id, pair.privateKey);
  return { deviceKeyId: res.device.id, privateKey: pair.privateKey };
}

export type UnlockInput =
  | { method: 'passkey'; authenticator: PasskeyAuthenticator }
  | { method: 'recovery'; code: string }
  | { method: 'passphrase'; passphrase: string };

export interface UnlockOptions {
  api: ApiClient;
  session: KeySession;
  userId: string;
  deviceKeys: DeviceKeyStore;
  /** When this device holds no signing key yet (a new browser), register one with this label. */
  registerDeviceLabel?: string;
}

const isWrongKey = (e: unknown) =>
  isCryptoError(e) && (e.reason === 'wrong_key' || e.reason === 'decrypt_failed');

/**
 * Unlock gate (spec 11.2): fetches the wrapped RK for the chosen method and unwraps it on the
 * device. A wrong code or passphrase throws `CryptoError('wrong_key')`.
 */
export async function unlock(input: UnlockInput, opts: UnlockOptions): Promise<void> {
  const { entries } = await opts.api.request(listKeyring, {});
  const active = entries.filter((e) => e.kind === input.method && e.revokedAt === null);
  if (active.length === 0) throw new DomainError('not_found', 'no such unlock method');

  let rootKey: Uint8Array | null = null;
  if (input.method === 'passkey') {
    const ids = active.map((e) => e.credentialId).filter((c): c is string => c !== null);
    const assertion = await input.authenticator.assert({ credentialIds: ids, prfSalt: PRF_SALT });
    const entry = active.find((e) => e.credentialId === assertion.credentialId);
    if (!entry) throw new DomainError('not_found', 'passkey is not registered');
    const full = await opts.api.request(getKeyringEntry, { params: { id: entry.id } });
    try {
      rootKey = await unlockWithPasskey({
        userId: opts.userId,
        prfOutput: assertion.prfOutput,
        wrappedRootKey: full.wrappedRootKey,
        kdfParams: full.kdfParams,
      });
    } finally {
      wipeBytes(assertion.prfOutput);
    }
  } else {
    let lastError: unknown = null;
    for (const entry of [...active].reverse()) {
      const full = await opts.api.request(getKeyringEntry, { params: { id: entry.id } });
      try {
        const args = {
          userId: opts.userId,
          wrappedRootKey: full.wrappedRootKey,
          kdfParams: full.kdfParams,
        };
        rootKey =
          input.method === 'recovery'
            ? await unlockWithRecoveryCode({ ...args, code: input.code })
            : await unlockWithPassphrase({ ...args, passphrase: input.passphrase });
        break;
      } catch (e) {
        if (!isWrongKey(e)) throw e;
        lastError = e;
      }
    }
    if (!rootKey) throw lastError;
  }

  let device = await opts.deviceKeys.load();
  await opts.session.unlock({ userId: opts.userId, rootKey, device });
  if (!device && opts.registerDeviceLabel) {
    device = await registerDevice(opts.api, opts.deviceKeys, opts.registerDeviceLabel);
    opts.session.setDevice(device);
  }
}

/** Agent unlock: RK wrapped by the device secret, both from the OS keychain. */
export async function unlockWithDevice(opts: {
  session: KeySession;
  secrets: SecretStore;
  deviceKeys: DeviceKeyStore;
}): Promise<void> {
  const [userId, secret, wrapped, params] = await Promise.all([
    opts.secrets.get(DEVICE_SECRETS.userId),
    opts.secrets.get(DEVICE_SECRETS.deviceSecret),
    opts.secrets.get(DEVICE_SECRETS.wrappedRootKey),
    opts.secrets.get(DEVICE_SECRETS.kdfParams),
  ]);
  if (!userId || !secret || !wrapped || !params) {
    throw new DomainError('not_found', 'this device is not linked');
  }
  try {
    const rootKey = await unlockWithDeviceSecret({
      userId: fromUtf8(userId),
      deviceSecret: secret,
      wrappedRootKey: wrapped,
      kdfParams: JSON.parse(fromUtf8(params)) as Record<string, unknown>,
    });
    await opts.session.unlock({
      userId: fromUtf8(userId),
      rootKey,
      device: await opts.deviceKeys.load(),
    });
  } finally {
    wipeBytes(secret);
  }
}

/** Adds another unlock method while unlocked (Settings → Security). */
export async function addUnlockMethod(
  opts: { api: ApiClient; session: KeySession },
  input:
    | { method: 'passkey'; authenticator: PasskeyAuthenticator; userName: string; label: string }
    | { method: 'passphrase'; passphrase: string; label?: string },
): Promise<{ added: boolean }> {
  const { userId } = opts.session;
  const rootKey = opts.session.keys.rootKey;
  let entry: PendingEntry;
  if (input.method === 'passkey') {
    const created = await input.authenticator.create({
      userName: input.userName,
      prfSalt: PRF_SALT,
    });
    if (!created.prfOutput) return { added: false };
    try {
      const e = await createPasskeyEntry({ userId, rootKey, prfOutput: created.prfOutput });
      entry = { kind: 'passkey', label: input.label, credentialId: created.credentialId, ...e };
    } finally {
      wipeBytes(created.prfOutput);
    }
  } else {
    const e = await createPassphraseEntry({ userId, rootKey, passphrase: input.passphrase });
    entry = { kind: 'passphrase', label: input.label ?? 'Passphrase', credentialId: null, ...e };
  }
  await opts.api.request(addKeyring, {
    body: { type: 'entry', ...entry, kdfParams: { ...entry.kdfParams } },
  });
  return { added: true };
}

/**
 * Regenerates the recovery code (Settings → Security). Returns the new code to show once; the
 * caller revokes the old entry after the user confirms the new one.
 */
export async function createRecoveryCode(opts: {
  api: ApiClient;
  session: KeySession;
}): Promise<{ code: string; entryId: string }> {
  const r = await createRecoveryEntry({
    userId: opts.session.userId,
    rootKey: opts.session.keys.rootKey,
  });
  const res = await opts.api.request(addKeyring, {
    body: {
      type: 'entry',
      kind: 'recovery',
      label: 'Recovery code',
      credentialId: null,
      wrappedRootKey: r.wrappedRootKey,
      kdfParams: { ...r.kdfParams },
    },
  });
  if (res.type !== 'entry') throw new DomainError('provider_error', 'unexpected keyring response');
  return { code: r.code, entryId: res.entry.id };
}
