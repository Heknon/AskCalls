import { z } from 'zod';
import { defineRoute } from '../route';
import { ConfigPatch, ConnectionTestSchema, TestPortSchema } from './admin';

/**
 * The first-run wizard (spec 11.2b). Public routes, open only while the instance has no
 * config; each needs the one-time setup token from the server log.
 */

const Token = z.string().trim().min(10).max(64);

export const SetupStateSchema = z.object({
  /** Config the server environment already sets: shown read-only in the wizard. */
  config: z.record(z.string(), z.unknown()),
  locked: z.array(z.string()),
  env: z.record(z.string(), z.string()),
  defaults: z.object({ pgliteDir: z.string(), fsDir: z.string() }),
  environment: z.enum(['production', 'development', 'test']),
  appUrl: z.string(),
});

/** 401 `unauthorized` for a wrong token; 404 once the instance is set up. */
export const verifySetup = defineRoute({
  method: 'POST',
  path: '/api/setup',
  auth: 'public',
  body: z.object({ token: Token }),
  response: SetupStateSchema,
});

export const testSetupConnection = defineRoute({
  method: 'POST',
  path: '/api/setup/test',
  auth: 'public',
  body: z.object({ token: Token, port: TestPortSchema, patch: ConfigPatch }),
  response: ConnectionTestSchema,
});

/** WebAuthn registration options for the admin's passkey (PublicKeyCredentialCreationOptionsJSON). */
export const setupPasskeyOptions = defineRoute({
  method: 'POST',
  path: '/api/setup/passkey',
  auth: 'public',
  body: z.object({ token: Token, email: z.string().trim().email().max(254) }),
  response: z.object({ options: z.record(z.string(), z.unknown()) }),
});

/**
 * Saves the config, creates the admin (password or passkey) in the new database and ends
 * setup. Returns a one-time claim the browser exchanges for a session.
 */
export const completeSetup = defineRoute({
  method: 'POST',
  path: '/api/setup/complete',
  auth: 'public',
  body: z.object({
    token: Token,
    patch: ConfigPatch,
    admin: z.object({
      email: z.string().trim().email().max(254),
      password: z.string().min(12).max(256).optional(),
      passkey: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
  response: z.object({ claim: z.string() }),
});
