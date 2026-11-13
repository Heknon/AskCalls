import { z } from 'zod';
import { defineRoute } from '../route';
import { DateCodec, QInt } from '../wire';

/**
 * Instance administration (spec 11.2b), admin role only. The config travels as the redacted
 * document: secrets are never in a response, only listed in `secrets` when set. A patch may
 * set a secret; `null` removes a setting.
 */

const Health = z.object({
  status: z.enum(['healthy', 'degraded', 'down']),
  message: z.string(),
  latencyMs: z.number().nullable(),
});

export const BlockerSchema = z.object({
  id: z.string(),
  adapter: z.string(),
  host: z.string(),
  fixes: z.array(z.string()),
  paths: z.array(z.string()),
});

export const InstanceViewSchema = z.object({
  version: z.string(),
  hosted: z.boolean(),
  environment: z.enum(['production', 'development', 'test']),
  config: z.record(z.string(), z.unknown()),
  locked: z.array(z.string()),
  /** Env var name per locked path. */
  env: z.record(z.string(), z.string()),
  secrets: z.array(z.string()),
  restartRequired: z.array(z.string()),
  offline: z.object({
    enabled: z.boolean(),
    locked: z.boolean(),
    blockers: z.array(BlockerSchema),
  }),
  health: z.object({
    database: Health,
    blob: Health,
    transcription: Health.nullable(),
    llm: Health.nullable(),
  }),
  usage: z.object({ users: z.number().int(), databaseEmpty: z.boolean() }),
  corsJson: z.string().nullable(),
});

export const ConfigPatch = z.record(z.string(), z.unknown());

export const TestPortSchema = z.enum(['database', 'blob', 'transcription', 'llm']);

export const ConnectionTestSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  latencyMs: z.number().nullable(),
  postgres: z
    .object({ version: z.string(), vector: z.string().nullable(), vectorAvailable: z.boolean() })
    .optional(),
  cors: z
    .object({ status: z.enum(['ok', 'missing', 'unknown']), fixJson: z.string().nullable() })
    .optional(),
});

export const getInstance = defineRoute({
  method: 'GET',
  path: '/api/admin/instance',
  auth: 'session',
  response: InstanceViewSchema,
});

/** 400 `invalid` with the problems; 403 on the hosted instance; 409 when a guard refuses. */
export const updateInstance = defineRoute({
  method: 'PATCH',
  path: '/api/admin/instance',
  auth: 'session',
  body: z.object({ patch: ConfigPatch }),
  response: InstanceViewSchema,
});

/** Runs the adapter's health check with the proposed settings, before saving them. */
export const testInstanceConnection = defineRoute({
  method: 'POST',
  path: '/api/admin/instance/test',
  auth: 'session',
  body: z.object({ port: TestPortSchema, patch: ConfigPatch }),
  response: ConnectionTestSchema,
});

/** Applies one of an offline blocker's one-click fixes. */
export const fixOfflineBlocker = defineRoute({
  method: 'POST',
  path: '/api/admin/instance/offline',
  auth: 'session',
  body: z.object({ blocker: z.string().max(40), fix: z.string().max(40) }),
  response: InstanceViewSchema,
});

export const promoteToAdmin = defineRoute({
  method: 'POST',
  path: '/api/admin/users',
  auth: 'session',
  body: z.object({ email: z.string().trim().email().max(254) }),
  response: z.object({ userId: z.string(), role: z.literal('admin'), alreadyAdmin: z.boolean() }),
});

const Count = z.number().int().nonnegative();

export const LimitsSchema = z.object({
  maxCalls: Count,
  transcriptionMinutesPerMonth: Count,
  recordingBytes: Count,
  maxApiTokens: Count,
  mcpFetchesPerTokenPerHour: Count,
  asksPerDay: Count,
  translationCharsPerMonth: Count,
});

export const LimitFieldSchema = LimitsSchema.keyof();

export const AccountSummarySchema = z.object({
  id: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  plan: z.enum(['free', 'pro']),
  role: z.enum(['user', 'admin']),
  createdAt: DateCodec,
  overridden: z.array(LimitFieldSchema),
  usage: z.object({
    calls: Count,
    recordingBytes: Count,
    transcriptionSecondsThisMonth: z.number().nonnegative(),
    asksToday: Count,
    translationCharsThisMonth: Count,
    apiTokens: Count,
  }),
});

export const AccountDetailSchema = AccountSummarySchema.extend({
  limits: LimitsSchema,
  instanceLimits: LimitsSchema,
  overrides: LimitsSchema.partial(),
});

/** Accounts newest first with their usage; `email` filters by a substring of the email. */
export const listAccounts = defineRoute({
  method: 'GET',
  path: '/api/admin/users',
  auth: 'session',
  query: z.object({
    email: z.string().max(254).optional(),
    cursor: z.string().max(512).optional(),
    limit: QInt.pipe(z.number().int().min(1).max(100)).optional(),
  }),
  response: z.object({ items: z.array(AccountSummarySchema), nextCursor: z.string().nullable() }),
});

const AccountParams = z.object({ id: z.string().min(1).max(64) });

export const getAccount = defineRoute({
  method: 'GET',
  path: '/api/admin/users/:id',
  auth: 'session',
  params: AccountParams,
  response: AccountDetailSchema,
});

/** A whole number overrides the instance limit; `null` clears the override. */
export const updateAccountLimits = defineRoute({
  method: 'PATCH',
  path: '/api/admin/users/:id/limits',
  auth: 'session',
  params: AccountParams,
  body: z.object({ limits: z.partialRecord(LimitFieldSchema, Count.nullable()) }),
  response: AccountDetailSchema,
});
