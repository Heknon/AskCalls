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
  /**
   * E2E only: the browser embeds with a deterministic stand-in instead of the model, for machines
   * without the model files. Honoured only when NODE_ENV=test (see testEmbedderEnabled).
   */
  testEmbedder: z.boolean().default(false),

  auth: z
    .object({
      secret,
      providers: z.array(z.enum(['google', 'github', 'email'])).default(['google']),
      localAccounts: z.boolean().default(false),
      google: z.object({ id: z.string().optional(), secret }).default({}),
      github: z.object({ id: z.string().optional(), secret }).default({}),
      /** Magic-link email: an SMTP URL (smtp(s)://user:pass@host:port) and the From address. */
      email: z.object({ server: secret, from: z.string().optional() }).default({}),
      /** Previews route OAuth through the dev deployment (spec 14). */
      redirectProxyUrl: z.string().url().optional(),
      /** Test-only sign-in provider for e2e. Never active when NODE_ENV=production. */
      testProvider: z.boolean().default(false),
      /**
       * Sign-in emails that are the instance admins. Set: exactly these accounts are admins and
       * the first-user rule is off. Empty: the first user becomes admin and admins can promote.
       */
      adminEmails: z.array(z.string().email()).default([]),
    })
    .default({
      providers: ['google'],
      localAccounts: false,
      google: {},
      github: {},
      email: {},
      testProvider: false,
      adminEmails: [],
    }),

  db: z
    .object({
      driver: z.enum(['postgres', 'pglite', 'memory']).default('postgres'),
      url: secret,
      pgliteDir: z.string().default('~/.askcalls/db'),
      /** Apply pending migrations when the server starts (self-host). PGlite always does. */
      migrateOnBoot: z.boolean().default(false),
    })
    .default({ driver: 'postgres', pgliteDir: '~/.askcalls/db', migrateOnBoot: false }),

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
          /** Prefix for every object key, e.g. `preview/pr-12/`: previews share the dev bucket. */
          keyPrefix: z
            .string()
            .regex(/^[^/]+(\/[^/]+)*\/$/, 'must be path segments ending in /, e.g. preview/pr-12/')
            .optional(),
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
      /** ElevenLabs Zero Retention Mode (`enable_logging=false`): Enterprise and trial plans only. */
      elevenlabsZeroRetention: z.boolean().default(false),
    })
    .default({
      provider: 'elevenlabs',
      keys: {},
      allowByoKey: true,
      elevenlabsZeroRetention: false,
    }),

  llm: z
    .object({
      /** Any AI SDK provider id (anthropic, openai, google, openai-compatible), or mock | none. */
      provider: z.string().default('anthropic'),
      model: z.string().optional(),
      apiKey: secret,
      baseUrl: z.string().url().optional(),
      /** Translation at ingest (`/api/translate`) through this LLM; false turns it off. */
      translation: z.boolean().default(true),
    })
    .default({ provider: 'anthropic', translation: true }),

  embeddingModel: z.string().default('Xenova/multilingual-e5-small'),
  /**
   * Where browsers fetch the embedding model files: a base URL under which
   * `e5-pruned/<build>/` is published (`bun run models:publish`). Unset: this app's /models/.
   * Ignored in offline mode. Files are verified against the hashes the app ships either way.
   */
  embeddingModelUrl: z
    .string()
    .url()
    .refine(
      (u) => /^https:\/\//.test(u) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(u),
      {
        message: 'must be an https URL',
      },
    )
    .optional(),

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

  /** Local mode (spec 11.2c), set by `askcalls local` for each start. */
  local: z
    .object({
      /**
       * Signs the browser in as the single local user: `askcalls local` opens
       * `/login#key=<key>`. A new random key on every start.
       */
      key: z.string().min(32).max(128).optional(),
      /**
       * The `askcalls local` process's link listener (`http://127.0.0.1:<port>/link/<nonce>`).
       * After unlock the browser hands it a token and a device link (spec 6.5), so `askcalls mcp`
       * works without `login` and `link`. Unset once the agent is linked.
       */
      agentLinkUrl: z
        .string()
        .regex(/^http:\/\/127\.0\.0\.1:\d{2,5}\/link\/[A-Za-z0-9_-]{43}$/, {
          message: 'must be the loopback link URL printed by askcalls local',
        })
        .optional(),
    })
    .default({}),

  billing: z.object({ provider: z.enum(['none']).default('none') }).default({ provider: 'none' }),

  scheduler: z.enum(['vercel-cron', 'in-process']).default('in-process'),
  /** Bearer secret for /api/cron/*. Without it the routes fail closed in production. */
  cronSecret: secret,
});

export type InstanceConfig = z.infer<typeof InstanceConfigSchema>;

/** Dotted paths whose values are secrets: masked in the UI, never sent back to the browser. */
export const SECRET_PATHS = new Set([
  'auth.secret',
  'auth.google.secret',
  'auth.github.secret',
  'auth.email.server',
  'cronSecret',
  'local.key',
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
  ['ASKCALLS_TEST_EMBEDDER', 'testEmbedder', bool],
  ['AUTH_SECRET', 'auth.secret', str],
  ['AUTH_PROVIDERS', 'auth.providers', list],
  ['AUTH_LOCAL_ACCOUNTS', 'auth.localAccounts', bool],
  ['AUTH_GOOGLE_ID', 'auth.google.id', str],
  ['AUTH_GOOGLE_SECRET', 'auth.google.secret', str],
  ['AUTH_GITHUB_ID', 'auth.github.id', str],
  ['AUTH_GITHUB_SECRET', 'auth.github.secret', str],
  ['AUTH_EMAIL_SERVER', 'auth.email.server', str],
  ['AUTH_EMAIL_FROM', 'auth.email.from', str],
  ['AUTH_REDIRECT_PROXY_URL', 'auth.redirectProxyUrl', str],
  ['AUTH_TEST_PROVIDER', 'auth.testProvider', bool],
  ['ADMIN_EMAILS', 'auth.adminEmails', list],
  ['DB_DRIVER', 'db.driver', str],
  ['DATABASE_URL', 'db.url', str],
  ['PGLITE_DATA_DIR', 'db.pgliteDir', str],
  ['DB_MIGRATE_ON_BOOT', 'db.migrateOnBoot', bool],
  ['BLOB_DRIVER', 'blob.driver', str],
  ['S3_ENDPOINT', 'blob.s3.endpoint', str],
  ['S3_REGION', 'blob.s3.region', str],
  ['S3_BUCKET', 'blob.s3.bucket', str],
  ['S3_ACCESS_KEY_ID', 'blob.s3.accessKeyId', str],
  ['S3_SECRET_ACCESS_KEY', 'blob.s3.secretAccessKey', str],
  ['S3_KEY_PREFIX', 'blob.s3.keyPrefix', str],
  ['FS_BLOB_DIR', 'blob.fsDir', str],
  ['ALLOW_USER_BUCKETS', 'blob.allowUserBuckets', bool],
  ['TRANSCRIPTION_PROVIDER', 'transcription.provider', str],
  ['ELEVENLABS_API_KEY', 'transcription.keys.elevenlabs', str],
  ['OPENAI_API_KEY', 'transcription.keys.openai', str],
  ['DEEPGRAM_API_KEY', 'transcription.keys.deepgram', str],
  ['SONIOX_API_KEY', 'transcription.keys.soniox', str],
  ['TRANSCRIPTION_BASE_URL', 'transcription.baseUrl', str],
  ['ALLOW_BYO_TRANSCRIPTION_KEY', 'transcription.allowByoKey', bool],
  ['ELEVENLABS_ZERO_RETENTION', 'transcription.elevenlabsZeroRetention', bool],
  ['LLM_PROVIDER', 'llm.provider', str],
  ['LLM_MODEL', 'llm.model', str],
  ['ANTHROPIC_API_KEY', 'llm.apiKey', str],
  ['LLM_BASE_URL', 'llm.baseUrl', str],
  ['LLM_TRANSLATION', 'llm.translation', bool],
  ['EMBEDDING_MODEL', 'embeddingModel', str],
  ['EMBEDDING_MODEL_URL', 'embeddingModelUrl', str],
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
  ['ASKCALLS_LOCAL_KEY', 'local.key', str],
  ['ASKCALLS_LOCAL_AGENT_LINK_URL', 'local.agentLinkUrl', str],
  ['SCHEDULER', 'scheduler', str],
  ['CRON_SECRET', 'cronSecret', str],
];
