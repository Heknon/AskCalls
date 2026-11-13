import type { Bytes } from '../entities/common';
import { DomainError } from '../entities/errors';
import type { DeviceLinkSession, DeviceLinkState } from '../entities/keyring';
import type { Ports } from '../ports-bundle';
import {
  type Actor,
  audit,
  base64url,
  constantTimeEqual,
  randomBytes,
  requireSession,
  sha256,
} from './context';
import { KEYRING_LIMITS } from './keyring';

/** Spec 6.5: sessions expire in 10 minutes. */
export const LINK_SESSION_TTL_MS = 10 * 60_000;
const SECRET_BYTES = 32;
const MAX_PAYLOAD_BYTES = 1_024;

const utf8 = (s: string) => new TextEncoder().encode(s);

function isExpired(s: DeviceLinkSession, now: Date): boolean {
  return s.expiresAt.getTime() <= now.getTime();
}

const effectiveState = (s: DeviceLinkSession, now: Date): DeviceLinkState =>
  s.state !== 'completed' && isExpired(s, now) ? 'expired' : s.state;

/** Loads a session the joiner addresses by id plus the one-time secret. */
async function sessionBySecret(
  ports: Ports,
  sessionId: string,
  secret: string,
): Promise<DeviceLinkSession> {
  const session = await ports.keyring.getLinkSession(sessionId);
  // Same error for a missing session and a wrong secret: no oracle for session ids.
  if (!session || !constantTimeEqual(await sha256(utf8(secret)), session.secretHash)) {
    throw new DomainError('not_found', 'link session not found');
  }
  return session;
}

async function ownSession(
  ports: Ports,
  actor: Actor,
  sessionId: string,
): Promise<DeviceLinkSession> {
  requireSession(actor);
  const session = await ports.keyring.getLinkSession(sessionId);
  if (!session || session.userId !== actor.userId) {
    throw new DomainError('not_found', 'link session not found');
  }
  return session;
}

function checkPublicKey(key: Bytes, what: string) {
  if (key.length === 0 || key.length > KEYRING_LIMITS.publicKeyBytes) {
    throw new DomainError('invalid', `${what} has an invalid size`);
  }
}

export interface StartedLink {
  sessionId: string;
  /** Shown once in the code / QR code. Only its sha256 is stored. */
  secret: string;
  expiresAt: Date;
}

/** Step 1, trusted device: opens a session and returns its one-time secret. */
export async function startDeviceLink(ports: Ports, actor: Actor): Promise<StartedLink> {
  requireSession(actor);
  const now = ports.clock.now();
  const secret = base64url(randomBytes(SECRET_BYTES));
  const session: DeviceLinkSession = {
    id: ports.ids.randomId(),
    userId: actor.userId,
    secretHash: await sha256(utf8(secret)),
    state: 'waiting_for_device',
    devicePublicKey: null,
    deviceLabel: null,
    deviceSigningPublicKey: null,
    encryptedRootKey: null,
    createdAt: now,
    expiresAt: new Date(now.getTime() + LINK_SESSION_TTL_MS),
  };
  await ports.keyring.createLinkSession(session);
  await audit(ports, actor, actor.userId, 'device.link_start', null, { sessionId: session.id });
  return { sessionId: session.id, secret, expiresAt: session.expiresAt };
}

export interface LinkStatus {
  state: DeviceLinkState;
  devicePublicKey: Bytes | null;
  deviceLabel: string | null;
  expiresAt: Date;
}

/** Trusted device polls this to show the joiner's key fingerprint (step 3). */
export async function getDeviceLinkStatus(
  ports: Ports,
  actor: Actor,
  sessionId: string,
): Promise<LinkStatus> {
  const s = await ownSession(ports, actor, sessionId);
  return {
    state: effectiveState(s, ports.clock.now()),
    devicePublicKey: s.devicePublicKey,
    deviceLabel: s.deviceLabel,
    expiresAt: s.expiresAt,
  };
}

export interface JoinLinkInput {
  secret: string;
  /** Joiner's ephemeral ECDH P-256 public key (SPKI). */
  devicePublicKey: Bytes;
  deviceLabel: string;
  /** Joiner's ECDSA P-256 signing public key (SPKI), registered on confirmation. */
  signingPublicKey: Bytes;
}

/** Step 2, new device: posts its public keys. Works once per session. */
export async function joinDeviceLink(
  ports: Ports,
  sessionId: string,
  input: JoinLinkInput,
): Promise<{ state: DeviceLinkState; expiresAt: Date }> {
  const s = await sessionBySecret(ports, sessionId, input.secret);
  const now = ports.clock.now();
  if (effectiveState(s, now) === 'expired') {
    throw new DomainError('not_found', 'link session expired', { reason: 'expired' });
  }
  if (s.state !== 'waiting_for_device') {
    throw new DomainError('conflict', 'a device already joined this session');
  }
  checkPublicKey(input.devicePublicKey, 'device public key');
  checkPublicKey(input.signingPublicKey, 'signing public key');
  if (!input.deviceLabel.trim() || input.deviceLabel.length > KEYRING_LIMITS.labelLength) {
    throw new DomainError('invalid', 'label must be 1..100 characters');
  }
  await ports.keyring.updateLinkSession(sessionId, {
    state: 'waiting_for_confirmation',
    devicePublicKey: input.devicePublicKey,
    deviceLabel: input.deviceLabel,
    deviceSigningPublicKey: input.signingPublicKey,
  });
  return { state: 'waiting_for_confirmation', expiresAt: s.expiresAt };
}

/**
 * Step 4, trusted device: after the user confirmed the fingerprint, posts ECIES(devicePub, RK).
 * Registers the joiner's signing key and a `device` keyring row (revoking it unlinks).
 */
export async function confirmDeviceLink(
  ports: Ports,
  actor: Actor,
  sessionId: string,
  input: { encryptedRootKey: Bytes },
): Promise<{ deviceKeyId: string; keyringEntryId: string }> {
  const s = await ownSession(ports, actor, sessionId);
  const now = ports.clock.now();
  if (effectiveState(s, now) === 'expired') {
    throw new DomainError('not_found', 'link session expired', { reason: 'expired' });
  }
  if (s.state !== 'waiting_for_confirmation' || !s.devicePublicKey || !s.deviceSigningPublicKey) {
    throw new DomainError('conflict', 'no device is waiting for confirmation');
  }
  if (input.encryptedRootKey.length === 0 || input.encryptedRootKey.length > MAX_PAYLOAD_BYTES) {
    throw new DomainError('invalid', 'encrypted root key has an invalid size');
  }
  const label = s.deviceLabel ?? 'Linked device';
  // The device key id is the session id: the joiner learns it with the payload.
  const device = await ports.keyring.addDevice({
    id: s.id,
    userId: s.userId,
    label,
    signingPublicKey: s.deviceSigningPublicKey,
  });
  const entry = await ports.keyring.add({
    id: ports.ids.randomId(),
    userId: s.userId,
    kind: 'device',
    label,
    credentialId: null,
    // The device keeps RK wrapped by its own local secret; the server row only tracks the link.
    wrappedRootKey: new Uint8Array(),
    kdfParams: { deviceKeyId: device.id },
  });
  await ports.keyring.updateLinkSession(sessionId, {
    state: 'completed',
    encryptedRootKey: input.encryptedRootKey,
  });
  await audit(ports, actor, s.userId, 'device.link', null, {
    deviceKeyId: device.id,
    keyringId: entry.id,
  });
  const user = await ports.users.findById(s.userId);
  if (user?.telemetryConsent.productEvents) {
    ports.telemetry.event(s.userId, { name: 'agent_linked' });
  }
  return { deviceKeyId: device.id, keyringEntryId: entry.id };
}

export type LinkFetchResult =
  | { state: Exclude<DeviceLinkState, 'completed'> }
  | {
      state: 'completed';
      encryptedRootKey: Bytes;
      deviceKeyId: string;
      keyringEntryId: string | null;
    };

/** Step 5, new device: collects the encrypted RK once; the payload is cleared after. */
export async function fetchDeviceLink(
  ports: Ports,
  sessionId: string,
  input: { secret: string },
): Promise<LinkFetchResult> {
  const s = await sessionBySecret(ports, sessionId, input.secret);
  const state = effectiveState(s, ports.clock.now());
  if (state !== 'completed') return { state };
  if (!s.encryptedRootKey) {
    throw new DomainError('not_found', 'link payload was already collected', {
      reason: 'collected',
    });
  }
  await ports.keyring.updateLinkSession(sessionId, { encryptedRootKey: null });
  const entries = await ports.keyring.list(s.userId);
  const entry = entries.find((e) => e.kind === 'device' && e.kdfParams.deviceKeyId === s.id);
  return {
    state: 'completed',
    encryptedRootKey: s.encryptedRootKey,
    deviceKeyId: s.id,
    keyringEntryId: entry?.id ?? null,
  };
}
