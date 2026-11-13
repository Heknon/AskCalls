import { z } from 'zod';

/**
 * The instance config document (spec 3.5). Stored as config.json in the data directory,
 * editable at /admin/instance. Every field has a default so a fresh instance boots.
 */
const secret = z.string().min(1).optional();

export const InstanceConfigSchema = z.object({
  appUrl: z.string().url().default('http://localhost:3000'),
  appMode: z.enum(['server', 'local']).default('server'),
  hosted: z.boolean().default(false),
  dataDir: z.string().default('./data'),
  offlineMode: z.boolean().default(false),

  auth: z
    .object({
      secret,
      providers: z.array(z.enum(['google', 'github', 'email'])).default(['google']),
      localAccounts: z.boolean().default(false),
      google: z.object({ id: z.string().optional(), secret }).default({}),
      github: z.object({ id: z.string().optional(), secret }).default({}),
    })
    .default({ providers: ['google'], localAccounts: false, google: {}, github: {} }),

  db: z
    .object({
      driver: z.enum(['postgres', 'pglite', 'memory']).default('postgres'),
      url: secret,
      pgliteDir: z.string().default('~/.askcalls/db'),
    })
    .default({ driver: 'postgres', pgliteDir: '~/.askcalls/db' }),

  blob: z
    .object({
      driver: z.enum(['s3', 'fs', 'memory']).default('s3'),
      s3: z
        .object({
          endpoint: z.string().url().optional(),
          region: z.string().optional(),
          bucket: z.string().optional(),
          accessKeyId: z.string().optional(),
          secretAccessKey: secret,
        })
        .default({}),
      fsDir: z.string().default('./data/blobs'),
      allowUserBuckets: z.boolean().default(true),
    })
    .default({ driver: 's3', s3: {}, fsDir: './data/blobs', allowUserBuckets: true }),

  transcription: z
    .object({
      provider: z
        .enum(['elevenlabs', 'openai', 'deepgram', 'soniox', 'openai-compatible', 'mock', 'none'])
        .default('elevenlabs'),
      keys: z
        .object({ elevenlabs: secret, openai: secret, deepgram: secret, soniox: secret })
        .default({}),
      baseUrl: z.string().url().optional(),
      allowByoKey: z.boolean().default(true),
    })
    .default({ provider: 'elevenlabs', keys: {}, allowByoKey: true }),

  llm: z
    .object({
      /** Any AI SDK provider id (anthropic, openai, google, openai-compatible), or mock | none. */
      provider: z.string().default('anthropic'),
      model: z.string().optional(),
      apiKey: secret,
      baseUrl: z.string().url().optional(),
    })
    .default({ provider: 'anthropic' }),

  embeddingModel: z.string().default('Xenova/multilingual-e5-small'),

  limits: z
    .object({ freeTierMaxCalls: z.number().int().positive().default(500) })
    .default({ freeTierMaxCalls: 500 }),

  telemetry: z
    .object({
      backends: z.array(z.enum(['otel', 'sentry', 'posthog', 'umami'])).default([]),
      otel: z.object({ endpoint: z.string().url().optional(), headers: secret }).default({}),
      sentryDsn: secret,
      posthog: z.object({ key: secret, host: z.string().url().optional() }).default({}),
      umami: z
        .object({ websiteId: z.string().optional(), host: z.string().url().optional() })
        .default({}),
    })
    .default({ backends: [], otel: {}, posthog: {}, umami: {} }),

  billing: z.object({ provider: z.enum(['none']).default('none') }).default({ provider: 'none' }),

  scheduler: z.enum(['vercel-cron', 'in-process']).default('in-process'),
});

export type InstanceConfig = z.infer<typeof InstanceConfigSchema>;

/** Dotted paths whose values are secrets: masked in the UI, never sent back to the browser. */
export const SECRET_PATHS = new Set([
  'auth.secret',
  'auth.google.secret',
  'auth.github.secret',
  'db.url',
  'blob.s3.secretAccessKey',
  'transcription.keys.elevenlabs',
  'transcription.keys.openai',
  'transcription.keys.deepgram',
  'transcription.keys.soniox',
  'llm.apiKey',
  'telemetry.otel.headers',
  'telemetry.sentryDsn',
  'telemetry.posthog.key',
]);

type Parse = (raw: string) => unknown;
const str: Parse = (v) => v;
const bool: Parse = (v) => {
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  throw new Error('must be true or false');
};
const int: Parse = (v) => {
  if (!/^\d+$/.test(v)) throw new Error('must be a whole number');
  return Number.parseInt(v, 10);
};
const list: Parse = (v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== 'none');

/** Every supported env var (spec 3.5): env name → config path and parser. Setting one locks it. */
export const ENV_BINDINGS: ReadonlyArray<readonly [env: string, path: string, parse: Parse]> = [
  ['APP_URL', 'appUrl', str],
  ['APP_MODE', 'appMode', str],
  ['ASKCALLS_HOSTED', 'hosted', bool],
  ['ASKCALLS_DATA_DIR', 'dataDir', str],
  ['OFFLINE_MODE', 'offlineMode', bool],
  ['AUTH_SECRET', 'auth.secret', str],
  ['AUTH_PROVIDERS', 'auth.providers', list],
  ['AUTH_LOCAL_ACCOUNTS', 'auth.localAccounts', bool],
  ['AUTH_GOOGLE_ID', 'auth.google.id', str],
  ['AUTH_GOOGLE_SECRET', 'auth.google.secret', str],
  ['AUTH_GITHUB_ID', 'auth.github.id', str],
  ['AUTH_GITHUB_SECRET', 'auth.github.secret', str],
  ['DB_DRIVER', 'db.driver', str],
  ['DATABASE_URL', 'db.url', str],
  ['PGLITE_DATA_DIR', 'db.pgliteDir', str],
  ['BLOB_DRIVER', 'blob.driver', str],
  ['S3_ENDPOINT', 'blob.s3.endpoint', str],
  ['S3_REGION', 'blob.s3.region', str],
  ['S3_BUCKET', 'blob.s3.bucket', str],
  ['S3_ACCESS_KEY_ID', 'blob.s3.accessKeyId', str],
  ['S3_SECRET_ACCESS_KEY', 'blob.s3.secretAccessKey', str],
  ['FS_BLOB_DIR', 'blob.fsDir', str],
  ['ALLOW_USER_BUCKETS', 'blob.allowUserBuckets', bool],
  ['TRANSCRIPTION_PROVIDER', 'transcription.provider', str],
  ['ELEVENLABS_API_KEY', 'transcription.keys.elevenlabs', str],
  ['OPENAI_API_KEY', 'transcription.keys.openai', str],
  ['DEEPGRAM_API_KEY', 'transcription.keys.deepgram', str],
  ['SONIOX_API_KEY', 'transcription.keys.soniox', str],
  ['TRANSCRIPTION_BASE_URL', 'transcription.baseUrl', str],
  ['ALLOW_BYO_TRANSCRIPTION_KEY', 'transcription.allowByoKey', bool],
  ['LLM_PROVIDER', 'llm.provider', str],
  ['LLM_MODEL', 'llm.model', str],
  ['ANTHROPIC_API_KEY', 'llm.apiKey', str],
  ['LLM_BASE_URL', 'llm.baseUrl', str],
  ['EMBEDDING_MODEL', 'embeddingModel', str],
  ['FREE_TIER_MAX_CALLS', 'limits.freeTierMaxCalls', int],
  ['TELEMETRY', 'telemetry.backends', list],
  ['OTEL_EXPORTER_OTLP_ENDPOINT', 'telemetry.otel.endpoint', str],
  ['OTEL_EXPORTER_OTLP_HEADERS', 'telemetry.otel.headers', str],
  ['SENTRY_DSN', 'telemetry.sentryDsn', str],
  ['POSTHOG_KEY', 'telemetry.posthog.key', str],
  ['POSTHOG_HOST', 'telemetry.posthog.host', str],
  ['UMAMI_WEBSITE_ID', 'telemetry.umami.websiteId', str],
  ['UMAMI_HOST', 'telemetry.umami.host', str],
  ['BILLING_PROVIDER', 'billing.provider', str],
  ['SCHEDULER', 'scheduler', str],
];
