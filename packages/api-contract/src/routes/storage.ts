import { z } from 'zod';
import { defineRoute } from '../route';

/**
 * Bring-your-own recording stores that need OAuth (spec 11.2a), in Auth.js's
 * `/<action>/<provider>` shape. Google Drive is the only provider so far.
 */
export const StorageProvider = z.enum(['google']);
export type StorageProvider = z.output<typeof StorageProvider>;

/** Who may receive the callback's message: the window that opened the popup, by this ticket. */
const Ticket = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/**
 * Opens in a popup: sets a short-lived signed cookie holding state and the PKCE verifier, then
 * redirects to the provider's consent screen.
 */
export const connectStorage = defineRoute({
  method: 'GET',
  path: '/api/storage/connect/:provider',
  auth: 'session',
  params: z.object({ provider: StorageProvider }),
  query: z.object({ ticket: Ticket }),
});

/**
 * The provider redirects here. The server trades the code for tokens and hands them to the
 * opener (postMessage to this origin) without storing them. The page carries a nonce CSP.
 */
export const storageCallback = defineRoute({
  method: 'GET',
  path: '/api/storage/callback/:provider',
  auth: 'session',
  params: z.object({ provider: StorageProvider }),
  query: z.object({
    code: z.string().max(2_048).optional(),
    state: z.string().max(512).optional(),
    error: z.string().max(256).optional(),
    scope: z.string().max(2_048).optional(),
  }),
});

/** The message the callback page posts to the opener. Tokens only ever travel inside it. */
export const StorageConnectMessage = z.discriminatedUnion('ok', [
  z.object({
    type: z.literal('askcalls:storage'),
    ticket: Ticket,
    ok: z.literal(true),
    refreshToken: z.string().min(1).max(4_096),
    accessToken: z.string().min(1).max(4_096),
    expiresInSec: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('askcalls:storage'),
    ticket: Ticket,
    ok: z.literal(false),
    error: z.enum(['denied', 'scope', 'failed']),
  }),
]);
export type StorageConnectMessage = z.output<typeof StorageConnectMessage>;

/**
 * Stateless pass-through: the client secret can't live in the browser or the agent, so the
 * server trades the device's refresh token for an access token, or revokes it, and forgets it.
 */
export const storageToken = defineRoute({
  method: 'POST',
  path: '/api/storage/token/:provider',
  auth: 'read',
  params: z.object({ provider: StorageProvider }),
  body: z.object({
    action: z.enum(['refresh', 'revoke']),
    refreshToken: z.string().min(1).max(4_096),
  }),
  response: z.discriminatedUnion('action', [
    z.object({
      action: z.literal('refresh'),
      accessToken: z.string(),
      expiresInSec: z.number().int().positive(),
    }),
    z.object({ action: z.literal('revoke'), revoked: z.literal(true) }),
  ]),
});
