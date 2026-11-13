import { z } from 'zod';
import { defineRoute } from '../route';
import { BytesCodec, BytesMax } from '../wire';

/** Encrypted per-user blobs with optimistic concurrency (UserData). */
export const UserDataKindSchema = z.enum([
  'tags',
  'contacts',
  'rules',
  'synonyms',
  'settings',
  'providers',
]);
const KindParam = z.object({ kind: UserDataKindSchema });

/** `version` 0 and `ct` null when never written. */
export const getUserData = defineRoute({
  method: 'GET',
  path: '/api/userdata/:kind',
  auth: 'read',
  params: KindParam,
  response: z.object({ kind: UserDataKindSchema, ct: BytesCodec.nullable(), version: z.number() }),
});

/** 409 `version_conflict` when `expectedVersion` is stale (details.current). */
export const putUserData = defineRoute({
  method: 'PUT',
  path: '/api/userdata/:kind',
  auth: 'write',
  params: KindParam,
  body: z.object({ ct: BytesMax(2 * 1024 * 1024), expectedVersion: z.number().int().min(0) }),
  response: z.object({ version: z.number().int() }),
});
