import { z } from 'zod';
import { defineRoute } from '../route';
import { DateCodec } from '../wire';

export const ApiScopeSchema = z.enum(['read', 'write', 'ask', 'keys']);

export const ApiTokenSchema = z.object({
  id: z.string(),
  name: z.string(),
  scopes: z.array(ApiScopeSchema),
  createdAt: DateCodec,
  lastUsedAt: DateCodec.nullable(),
  expiresAt: DateCodec.nullable(),
  revokedAt: DateCodec.nullable(),
});

/** `fetchesThisHour`: ciphertext fetches in the token's current hourly budget window. */
export const listTokens = defineRoute({
  method: 'GET',
  path: '/api/tokens',
  auth: 'session',
  response: z.object({
    items: z.array(ApiTokenSchema.extend({ fetchesThisHour: z.number().int().min(0) })),
  }),
});

/** `token` (`ac_…`) is shown once; the server keeps only its sha256. */
export const createToken = defineRoute({
  method: 'POST',
  path: '/api/tokens',
  auth: 'session',
  body: z.object({
    name: z.string().min(1).max(100),
    scopes: z.array(ApiScopeSchema).min(1).max(4),
    /** Null: never expires. */
    expiresInDays: z.number().int().min(1).max(365).nullable(),
  }),
  response: z.object({ token: z.string(), record: ApiTokenSchema }),
});

export const revokeToken = defineRoute({
  method: 'DELETE',
  path: '/api/tokens',
  auth: 'session',
  query: z.object({ id: z.string().min(1).max(64) }),
  response: z.object({ revoked: z.literal(true) }),
});
