import type { ApiClient } from '@askcalls/api-contract';
import {
  confirmLink,
  fetchLink,
  getLink,
  joinLink,
  startLink,
} from '@askcalls/api-contract/routes/devices';
import { addKeyring } from '@askcalls/api-contract/routes/keyring';
import {
  createDeviceEntry,
  createPasskeyEntry,
  decryptRootKeyFromLink,
  type EcdhKeyPair,
  encryptRootKeyForDevice,
  fromBase64Url,
  fromUtf8,
  generateDeviceSecret,
  generateEcdhKeyPair,
  generateSigningKeyPair,
  PRF_SALT,
  publicKeyFingerprint,
  type SigningKeyPair,
  toBase64Url,
  utf8,
  wipeBytes,
} from '@askcalls/crypto';
import { DomainError } from '@askcalls/domain';
import { z } from 'zod';
import { DEVICE_SECRETS } from './keys';
import type { DeviceKeyStore, PasskeyAuthenticator, SecretStore } from './ports/index';
import type { KeySession } from './session';

/**
 * Device linking (spec 6.5). The trusted device opens a session and shows a link code (and a QR
 * code of it) holding the session id, the one-time secret and the user id. The joiner posts its
 * ECDH and signing public keys; both devices show a 6-digit fingerprint of the joiner's ECDH key,
 * keyed with the link secret so a relay can't grind a matching key. After the user confirms the
 * digits match, the trusted device sends ECIES(joinerKey, RK).
 */
const LinkCodeSchema = z.object({
  v: z.literal(1),
  s: z.string().min(1).max(64),
  k: z.string().min(16).max(128),
  u: z.string().min(1).max(64),
});

export interface LinkCode {
  sessionId: string;
  secret: string;
  userId: string;
}

export function encodeLinkCode(code: LinkCode): string {
  return toBase64Url(
    utf8(JSON.stringify({ v: 1, s: code.sessionId, k: code.secret, u: code.userId })),
  );
}

export function parseLinkCode(text: string): LinkCode {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fromUtf8(fromBase64Url(text.trim())));
  } catch {
    throw new DomainError('invalid', 'link code is not readable');
  }
  const r = LinkCodeSchema.safeParse(parsed);
  if (!r.success) throw new DomainError('invalid', 'link code is not readable');
  return { sessionId: r.data.s, secret: r.data.k, userId: r.data.u };
}

const linkFingerprint = (devicePublicKey: Uint8Array, secret: string) =>
  publicKeyFingerprint(devicePublicKey, fromBase64Url(secret));

// ---- Trusted device ------------------------------------------------------------------------

export interface StartedDeviceLink extends LinkCode {
  /** The text to show and to encode in the QR code. */
  code: string;
  expiresAt: Date;
}

export async function startDeviceLink(opts: {
  api: ApiClient;
  session: KeySession;
}): Promise<StartedDeviceLink> {
  const { userId } = opts.session;
  const s = await opts.api.request(startLink, {});
  const link = { sessionId: s.sessionId, secret: s.secret, userId };
  return { ...link, code: encodeLinkCode(link), expiresAt: s.expiresAt };
}

export type InitiatorLinkStatus =
  | { state: 'waiting_for_device' | 'completed' | 'expired' }
  | {
      state: 'waiting_for_confirmation';
      fingerprint: string;
      deviceLabel: string | null;
      devicePublicKey: Uint8Array;
    };

/** Poll until a device joined, then show `fingerprint` next to the joiner's. */
export async function checkDeviceLink(
  api: ApiClient,
  link: Pick<LinkCode, 'sessionId' | 'secret'>,
): Promise<InitiatorLinkStatus> {
  const s = await api.request(getLink, { params: { session: link.sessionId } });
  if (s.state !== 'waiting_for_confirmation' || !s.devicePublicKey) {
    return { state: s.state === 'waiting_for_confirmation' ? 'waiting_for_device' : s.state };
  }
  return {
    state: 'waiting_for_confirmation',
    fingerprint: await linkFingerprint(s.devicePublicKey, link.secret),
    deviceLabel: s.deviceLabel,
    devicePublicKey: s.devicePublicKey,
  };
}

/** Called only after the user confirmed the fingerprints match. */
export async function confirmDeviceLink(
  opts: { api: ApiClient; session: KeySession },
  link: Pick<LinkCode, 'sessionId'>,
  devicePublicKey: Uint8Array,
): Promise<{ deviceKeyId: string; keyringEntryId: string }> {
  const encryptedRootKey = await encryptRootKeyForDevice(
    devicePublicKey,
    opts.session.userId,
    opts.session.keys.rootKey,
  );
  return opts.api.request(confirmLink, {
    params: { session: link.sessionId },
    body: { action: 'confirm', encryptedRootKey },
  });
}

// ---- Joining device ------------------------------------------------------------------------

/** How the joiner keeps RK once it has it. */
export type JoinerStorage =
  | { kind: 'device-secret'; secrets: SecretStore }
  | {
      kind: 'passkey';
      authenticator: PasskeyAuthenticator;
      userName: string;
      label: string;
    };

export type JoinerPoll =
  | { state: 'waiting_for_device' | 'waiting_for_confirmation' | 'expired' }
  | { state: 'completed'; deviceKeyId: string };

export class DeviceLinkJoiner {
  #ecdh: EcdhKeyPair;
  #signing: SigningKeyPair;
  #done = false;

  private constructor(
    private readonly api: ApiClient,
    readonly link: LinkCode,
    ecdh: EcdhKeyPair,
    signing: SigningKeyPair,
    /** Show this; the user compares it with the trusted device. */
    readonly fingerprint: string,
  ) {
    this.#ecdh = ecdh;
    this.#signing = signing;
  }

  static async join(opts: {
    api: ApiClient;
    code: string;
    deviceLabel: string;
    deviceKeys: DeviceKeyStore;
  }): Promise<DeviceLinkJoiner> {
    const link = parseLinkCode(opts.code);
    const [ecdh, signing] = await Promise.all([
      generateEcdhKeyPair(),
      generateSigningKeyPair({ extractable: opts.deviceKeys.extractable }),
    ]);
    await opts.api.request(joinLink, {
      params: { session: link.sessionId },
      body: {
        action: 'join',
        secret: link.secret,
        devicePublicKey: ecdh.publicKey,
        deviceLabel: opts.deviceLabel,
        signingPublicKey: signing.publicKey,
      },
    });
    const fingerprint = await linkFingerprint(ecdh.publicKey, link.secret);
    return new DeviceLinkJoiner(opts.api, link, ecdh, signing, fingerprint);
  }

  /**
   * Polls once. On `completed`, decrypts RK, stores it wrapped by the local secret (agent) or a
   * new passkey (browser), saves the signing key and unlocks `session`.
   */
  async poll(opts: {
    session: KeySession;
    deviceKeys: DeviceKeyStore;
    storage: JoinerStorage;
  }): Promise<JoinerPoll> {
    if (this.#done) throw new DomainError('conflict', 'link already completed');
    const res = await this.api.request(fetchLink, {
      params: { session: this.link.sessionId },
      body: { action: 'fetch', secret: this.link.secret },
    });
    if (res.state !== 'completed') return { state: res.state };

    const { userId } = this.link;
    const rootKey = await decryptRootKeyFromLink(
      this.#ecdh.privateKey,
      userId,
      res.encryptedRootKey,
    );
    try {
      await storeLinkedRootKey(this.api, userId, rootKey, opts.storage);
      await opts.deviceKeys.save(res.deviceKeyId, this.#signing.privateKey);
      if (opts.storage.kind === 'device-secret') {
        await opts.storage.secrets.set(DEVICE_SECRETS.deviceKeyId, utf8(res.deviceKeyId));
      }
      await opts.session.unlock({
        userId,
        rootKey: new Uint8Array(rootKey),
        device: { deviceKeyId: res.deviceKeyId, privateKey: this.#signing.privateKey },
      });
    } finally {
      wipeBytes(rootKey);
    }
    this.#done = true;
    return { state: 'completed', deviceKeyId: res.deviceKeyId };
  }
}

async function storeLinkedRootKey(
  api: ApiClient,
  userId: string,
  rootKey: Uint8Array,
  storage: JoinerStorage,
): Promise<void> {
  if (storage.kind === 'device-secret') {
    const deviceSecret = generateDeviceSecret();
    try {
      const entry = await createDeviceEntry({ userId, rootKey, deviceSecret });
      await Promise.all([
        storage.secrets.set(DEVICE_SECRETS.userId, utf8(userId)),
        storage.secrets.set(DEVICE_SECRETS.deviceSecret, deviceSecret),
        storage.secrets.set(DEVICE_SECRETS.wrappedRootKey, entry.wrappedRootKey),
        storage.secrets.set(DEVICE_SECRETS.kdfParams, utf8(JSON.stringify(entry.kdfParams))),
      ]);
    } finally {
      wipeBytes(deviceSecret);
    }
    return;
  }
  const created = await storage.authenticator.create({
    userName: storage.userName,
    prfSalt: PRF_SALT,
  });
  if (!created.prfOutput) {
    throw new DomainError('unsupported', 'this browser does not support passkey PRF');
  }
  try {
    const entry = await createPasskeyEntry({ userId, rootKey, prfOutput: created.prfOutput });
    await api.request(addKeyring, {
      body: {
        type: 'entry',
        kind: 'passkey',
        label: storage.label,
        credentialId: created.credentialId,
        wrappedRootKey: entry.wrappedRootKey,
        kdfParams: { ...entry.kdfParams },
      },
    });
  } finally {
    wipeBytes(created.prfOutput);
  }
}
