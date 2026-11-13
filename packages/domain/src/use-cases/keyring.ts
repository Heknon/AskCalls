import type { Bytes } from '../entities/common';
import { DomainError } from '../entities/errors';
import type { DeviceKey, KeyringEntry, KeyringKind, UserKeys } from '../entities/keyring';
import type { Ports } from '../ports-bundle';
import { type Actor, audit, requireSession } from './context';

export const KEYRING_LIMITS = {
  activeEntries: 32,
  wrappedRootKeyBytes: 512,
  kdfParamsJsonBytes: 4_096,
  labelLength: 100,
  publicKeyBytes: 512,
} as const;

/** Unlock methods a user can add directly; `device` rows come from the link handshake. */
const USER_ADDED_KINDS: readonly KeyringKind[] = ['passkey', 'recovery', 'passphrase'];

export type KeyringEntrySummary = Omit<KeyringEntry, 'wrappedRootKey' | 'userId'>;

export interface KeyringOverview {
  entries: KeyringEntrySummary[];
  devices: Array<Omit<DeviceKey, 'userId'>>;
  userKeys: Omit<UserKeys, 'userId'> | null;
}

const summarize = ({ wrappedRootKey: _w, userId: _u, ...rest }: KeyringEntry) => rest;

/** Everything a device needs after unlocking, minus wrapped root keys (fetched one by one). */
export async function listKeyring(ports: Ports, actor: Actor): Promise<KeyringOverview> {
  const userId = actor.userId;
  const [entries, devices, keys] = await Promise.all([
    ports.keyring.list(userId),
    ports.keyring.listDevices(userId),
    ports.keyring.getUserKeys(userId),
  ]);
  return {
    entries: entries.map(summarize),
    devices: devices.map(({ userId: _u, ...d }) => d),
    userKeys: keys ? stripUser(keys) : null,
  };
}

function stripUser({ userId: _u, ...rest }: UserKeys): Omit<UserKeys, 'userId'> {
  return rest;
}

export interface AddKeyringEntryInput {
  kind: KeyringKind;
  label: string;
  credentialId: string | null;
  wrappedRootKey: Bytes;
  kdfParams: Record<string, unknown>;
}

export async function addKeyringEntry(
  ports: Ports,
  actor: Actor,
  input: AddKeyringEntryInput,
): Promise<KeyringEntrySummary> {
  requireSession(actor);
  const userId = actor.userId;
  if (!USER_ADDED_KINDS.includes(input.kind)) {
    throw new DomainError('invalid', 'unsupported unlock method');
  }
  if (input.kind === 'passkey' && !input.credentialId) {
    throw new DomainError('invalid', 'a passkey needs its credential id');
  }
  if (
    input.wrappedRootKey.length === 0 ||
    input.wrappedRootKey.length > KEYRING_LIMITS.wrappedRootKeyBytes
  ) {
    throw new DomainError('invalid', 'wrapped root key has an invalid size');
  }
  if (JSON.stringify(input.kdfParams).length > KEYRING_LIMITS.kdfParamsJsonBytes) {
    throw new DomainError('invalid', 'kdf params are too large');
  }
  if (!input.label.trim() || input.label.length > KEYRING_LIMITS.labelLength) {
    throw new DomainError('invalid', 'label must be 1..100 characters');
  }
  const active = await ports.keyring.list(userId);
  if (active.length >= KEYRING_LIMITS.activeEntries) {
    throw new DomainError('quota_exceeded', 'too many unlock methods', {
      limit: KEYRING_LIMITS.activeEntries,
      quota: 'keyring',
    });
  }
  if (input.credentialId && active.some((e) => e.credentialId === input.credentialId)) {
    throw new DomainError('conflict', 'this passkey is already registered');
  }
  const entry = await ports.keyring.add({
    id: ports.ids.randomId(),
    userId,
    kind: input.kind,
    label: input.label,
    credentialId: input.credentialId,
    wrappedRootKey: input.wrappedRootKey,
    kdfParams: input.kdfParams,
  });
  await audit(ports, actor, userId, 'keyring.add', null, { keyringId: entry.id, kind: entry.kind });
  return summarize(entry);
}

/**
 * Stores the inbox public key and the KEK-encrypted inbox private key (onboarding step 4).
 * Replacing them needs a higher keyVersion, so a stale device can't make the inbox unreadable.
 */
export async function putUserKeys(
  ports: Ports,
  actor: Actor,
  input: Omit<UserKeys, 'userId'>,
): Promise<void> {
  requireSession(actor);
  const userId = actor.userId;
  if (!Number.isInteger(input.keyVersion) || input.keyVersion < 1) {
    throw new DomainError('invalid', 'keyVersion must be a positive integer');
  }
  if (
    input.inboxPublicKey.length === 0 ||
    input.inboxPublicKey.length > KEYRING_LIMITS.publicKeyBytes
  ) {
    throw new DomainError('invalid', 'inbox public key has an invalid size');
  }
  const current = await ports.keyring.getUserKeys(userId);
  if (current && input.keyVersion <= current.keyVersion) {
    throw new DomainError('version_conflict', 'user keys already exist at this version', {
      current: current.keyVersion,
    });
  }
  await ports.keyring.putUserKeys({ ...input, userId });
  await audit(ports, actor, userId, 'keyring.setup', null, { keyVersion: input.keyVersion });
}

/** Registers this device's signing key (spec 6.6). Linked devices register through 6.5. */
export async function registerDevice(
  ports: Ports,
  actor: Actor,
  input: { label: string; signingPublicKey: Bytes },
): Promise<Omit<DeviceKey, 'userId'>> {
  requireSession(actor);
  const userId = actor.userId;
  if (!input.label.trim() || input.label.length > KEYRING_LIMITS.labelLength) {
    throw new DomainError('invalid', 'label must be 1..100 characters');
  }
  if (
    input.signingPublicKey.length === 0 ||
    input.signingPublicKey.length > KEYRING_LIMITS.publicKeyBytes
  ) {
    throw new DomainError('invalid', 'signing public key has an invalid size');
  }
  const { userId: _u, ...device } = await ports.keyring.addDevice({
    id: ports.ids.randomId(),
    userId,
    label: input.label,
    signingPublicKey: input.signingPublicKey,
  });
  await audit(ports, actor, userId, 'device.link', null, { deviceKeyId: device.id, mode: 'self' });
  return device;
}

/** Fetches one wrapped root key for unlocking and records its use. */
export async function getKeyringEntry(
  ports: Ports,
  actor: Actor,
  id: string,
): Promise<Omit<KeyringEntry, 'userId'>> {
  const userId = actor.userId;
  const entry = await ports.keyring.get(userId, id);
  if (!entry) throw new DomainError('not_found', 'unlock method not found');
  const now = ports.clock.now();
  await ports.keyring.touch(userId, id, now);
  await audit(ports, actor, userId, 'keyring.read', null, { keyringId: id, kind: entry.kind });
  const { userId: _u, ...rest } = entry;
  return { ...rest, lastUsedAt: now };
}

/**
 * Revokes an unlock method. A `device` row also revokes its signing key (spec 6.5). The last
 * non-device method can't be revoked: that would leave no way to unlock on a new device.
 */
export async function revokeKeyringEntry(ports: Ports, actor: Actor, id: string): Promise<void> {
  requireSession(actor);
  const userId = actor.userId;
  const active = await ports.keyring.list(userId);
  const entry = active.find((e) => e.id === id);
  if (!entry) throw new DomainError('not_found', 'unlock method not found');
  if (entry.kind !== 'device') {
    const others = active.filter((e) => e.kind !== 'device' && e.id !== id);
    if (others.length === 0) {
      throw new DomainError('conflict', 'cannot revoke the last unlock method');
    }
  }
  const now = ports.clock.now();
  await ports.keyring.revoke(userId, id, now);
  const deviceKeyId = entry.kdfParams.deviceKeyId;
  if (entry.kind === 'device' && typeof deviceKeyId === 'string') {
    await ports.keyring.revokeDevice(userId, deviceKeyId, now);
    await audit(ports, actor, userId, 'device.revoke', null, { deviceKeyId, keyringId: id });
  }
  await audit(ports, actor, userId, 'keyring.revoke', null, { keyringId: id, kind: entry.kind });
}
