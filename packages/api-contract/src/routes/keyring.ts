import { z } from 'zod';
import { defineRoute } from '../route';
import { BytesCodec, BytesMax, DateCodec } from '../wire';

export const KeyringKindSchema = z.enum(['passkey', 'recovery', 'passphrase', 'device']);

export const KeyringEntrySummarySchema = z.object({
  id: z.string(),
  kind: KeyringKindSchema,
  label: z.string(),
  credentialId: z.string().nullable(),
  kdfParams: z.record(z.string(), z.unknown()),
  createdAt: DateCodec,
  lastUsedAt: DateCodec.nullable(),
  revokedAt: DateCodec.nullable(),
});

export const DeviceKeySchema = z.object({
  id: z.string(),
  label: z.string(),
  signingPublicKey: BytesCodec,
  createdAt: DateCodec,
  revokedAt: DateCodec.nullable(),
});

export const UserKeysSchema = z.object({
  inboxPublicKey: BytesCodec,
  inboxPrivateKeyCt: BytesCodec,
  keyVersion: z.number().int(),
});

/** Unlock methods (no wrapped keys), device signing keys and the inbox key pair. */
export const listKeyring = defineRoute({
  method: 'GET',
  path: '/api/keyring',
  auth: 'keys',
  response: z.object({
    entries: z.array(KeyringEntrySummarySchema),
    devices: z.array(DeviceKeySchema),
    userKeys: UserKeysSchema.nullable(),
  }),
});

/**
 * Adds an unlock method, stores the inbox key pair (onboarding step 4), or registers this
 * device's signing key.
 */
export const addKeyring = defineRoute({
  method: 'POST',
  path: '/api/keyring',
  auth: 'session',
  body: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('entry'),
      kind: z.enum(['passkey', 'recovery', 'passphrase']),
      label: z.string().min(1).max(100),
      credentialId: z.string().max(1024).nullable(),
      wrappedRootKey: BytesMax(512),
      kdfParams: z.record(z.string(), z.unknown()),
    }),
    z.object({
      type: z.literal('userKeys'),
      inboxPublicKey: BytesMax(512),
      inboxPrivateKeyCt: BytesMax(1024),
      keyVersion: z.number().int().min(1),
    }),
    z.object({
      type: z.literal('device'),
      label: z.string().min(1).max(100),
      signingPublicKey: BytesMax(512),
    }),
  ]),
  response: z.discriminatedUnion('type', [
    z.object({ type: z.literal('entry'), entry: KeyringEntrySummarySchema }),
    z.object({ type: z.literal('userKeys'), keyVersion: z.number().int() }),
    z.object({ type: z.literal('device'), device: DeviceKeySchema }),
  ]),
});

const IdParam = z.object({ id: z.string().min(1).max(64) });

/** One wrapped root key, for unlocking. */
export const getKeyringEntry = defineRoute({
  method: 'GET',
  path: '/api/keyring/:id',
  auth: 'keys',
  params: IdParam,
  response: KeyringEntrySummarySchema.extend({ wrappedRootKey: BytesCodec }),
});

/** Revokes an unlock method; a `device` row also unlinks that device. */
export const revokeKeyring = defineRoute({
  method: 'DELETE',
  path: '/api/keyring/:id',
  auth: 'session',
  params: IdParam,
  response: z.object({ revoked: z.literal(true) }),
});
