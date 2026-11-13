import type { Bytes, UserId } from './common';

export type KeyringKind = 'passkey' | 'recovery' | 'passphrase' | 'device';

/** One unlock method: the root key wrapped by a key derived from that method (spec 6.2). */
export interface KeyringEntry {
  id: string;
  userId: UserId;
  kind: KeyringKind;
  label: string;
  /** WebAuthn credential id (base64url) for passkeys. */
  credentialId: string | null;
  wrappedRootKey: Bytes;
  /** KDF parameters needed to re-derive the wrap key (salt, Argon2 params, PRF salt, …). No secrets. */
  kdfParams: Record<string, unknown>;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export type NewKeyringEntry = Omit<KeyringEntry, 'createdAt' | 'lastUsedAt' | 'revokedAt'>;

export interface UserKeys {
  userId: UserId;
  /** ECDH P-256 public key, SPKI bytes. */
  inboxPublicKey: Bytes;
  /** Inbox private key encrypted with the KEK. */
  inboxPrivateKeyCt: Bytes;
  keyVersion: number;
}

export interface DeviceKey {
  id: string;
  userId: UserId;
  label: string;
  /** ECDSA P-256 public key, SPKI bytes. */
  signingPublicKey: Bytes;
  createdAt: Date;
  revokedAt: Date | null;
}

export type DeviceLinkState =
  | 'waiting_for_device'
  | 'waiting_for_confirmation'
  | 'completed'
  | 'expired';

/** Device-link handshake (spec 6.5). Lives 10 minutes. */
export interface DeviceLinkSession {
  id: string;
  userId: UserId;
  /** sha256 of the one-time secret shown in the code / QR; the joiner proves knowledge of it. */
  secretHash: Bytes;
  state: DeviceLinkState;
  /** Joiner's ephemeral ECDH P-256 public key (SPKI). */
  devicePublicKey: Bytes | null;
  deviceLabel: string | null;
  /** ECIES(devicePublicKey, RK), written by the trusted device after fingerprint confirmation. */
  encryptedRootKey: Bytes | null;
  createdAt: Date;
  expiresAt: Date;
}
