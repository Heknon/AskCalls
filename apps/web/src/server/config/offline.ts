import { POSTHOG_DEFAULT_HOST } from '@askcalls/adapter-telemetry-posthog';
import { UMAMI_DEFAULT_HOST } from '@askcalls/adapter-telemetry-umami';
import type { InstanceConfig } from './schema';

/**
 * Offline (air-gapped) mode, spec 11.2b: which configured settings would reach the internet,
 * and the one-click fixes for each. Used by the admin toggle, by `validateCombination` (an
 * instance in offline mode never resolves with a blocker) and by the guarded fetch.
 */

const PRIVATE_V4 = [
  [10, 0, 8],
  [127, 0, 8],
  [172, 16, 12],
  [192, 168, 16],
  [169, 254, 16],
  [0, 0, 8],
] as const;

function ipv4(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

/**
 * A host inside the local network: loopback, private and link-local addresses, single-label
 * names (Docker service names such as `db` or `ollama`) and the reserved local suffixes.
 */
export function isLocalHost(rawHost: string): boolean {
  const host = rawHost.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  const v4 = ipv4(host);
  if (v4) {
    const n = ((v4[0]! << 24) | (v4[1]! << 16) | (v4[2]! << 8) | v4[3]!) >>> 0;
    return PRIVATE_V4.some(([a, b, bits]) => {
      const base = ((a << 24) | (b << 16)) >>> 0;
      const mask = (~0 << (32 - bits)) >>> 0;
      return (n & mask) >>> 0 === (base & mask) >>> 0;
    });
  }
  if (host.includes(':')) {
    return host === '::1' || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host);
  }
  if (!host.includes('.')) return true;
  return /(^|\.)(localhost|local|internal|lan|home\.arpa)$/.test(host);
}

/** The host of a URL or `host:port`, or null when it doesn't parse. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url.includes('://') ? url : `http://${url}`).hostname || null;
  } catch {
    return null;
  }
}

export function isLocalUrl(url: string): boolean {
  const host = hostOf(url);
  return host !== null && isLocalHost(host);
}

export type BlockerId =
  | 'database'
  | 'blob'
  | 'sign-in-google'
  | 'sign-in-github'
  | 'sign-in-email'
  | 'local-accounts'
  | 'auth-redirect-proxy'
  | 'transcription'
  | 'llm'
  | 'telemetry-otel'
  | 'telemetry-sentry'
  | 'telemetry-posthog'
  | 'telemetry-umami';

export type FixId =
  | 'local-whisper'
  | 'local-ollama'
  | 'off'
  | 'local-folder'
  | 'local-accounts-on'
  | 'this-instance';

export interface OfflineBlocker {
  id: BlockerId;
  /** Provider or adapter id shown in "Transcription: ElevenLabs". */
  adapter: string;
  /** The internet host it reaches; empty for a missing local requirement. */
  host: string;
  /** One-click fixes, suggested first. Fixes that would change an env-locked setting are left out. */
  fixes: FixId[];
  /** Config paths involved: if one is env-locked, a forced offline boot fails on it. */
  paths: string[];
}

export const LOCAL_WHISPER_URL = 'http://localhost:8000/v1';
export const LOCAL_OLLAMA_URL = 'http://localhost:11434/v1';
export const LOCAL_OLLAMA_MODEL = 'llama3.2';

const TRANSCRIPTION_HOSTS: Record<string, string> = {
  elevenlabs: 'api.elevenlabs.io',
  openai: 'api.openai.com',
  deepgram: 'api.deepgram.com',
  soniox: 'api.soniox.com',
};

const LLM_HOSTS: Record<string, string> = {
  anthropic: 'api.anthropic.com',
  openai: 'api.openai.com',
  google: 'generativelanguage.googleapis.com',
  mistral: 'api.mistral.ai',
  groq: 'api.groq.com',
  xai: 'api.x.ai',
};

function smtpHost(server: string): string | null {
  return hostOf(server.replace(/^smtps?:\/\//, 'http://'));
}

const FIX_PATHS: Record<FixId, string[]> = {
  'local-whisper': ['transcription.provider', 'transcription.baseUrl'],
  'local-ollama': ['llm.provider', 'llm.baseUrl', 'llm.model', 'llm.apiKey'],
  off: [],
  'local-folder': ['blob.driver'],
  'local-accounts-on': ['auth.localAccounts'],
  'this-instance': [],
};

/**
 * Every configured setting that would reach the internet, in the order the admin page lists
 * them. The embedding model URL is not one: offline mode always serves the model itself.
 */
export function offlineBlockers(
  c: InstanceConfig,
  locked: ReadonlySet<string> = new Set(),
): OfflineBlocker[] {
  const out: OfflineBlocker[] = [];
  const add = (b: OfflineBlocker, offPaths: string[] = []) => {
    const fixes = b.fixes.filter((f) => {
      const paths = f === 'off' || f === 'this-instance' ? offPaths : FIX_PATHS[f];
      return !paths.some((p) => locked.has(p));
    });
    out.push({ ...b, fixes });
  };

  const t = c.transcription;
  const txHost =
    t.provider === 'openai-compatible'
      ? t.baseUrl && !isLocalUrl(t.baseUrl)
        ? hostOf(t.baseUrl)
        : null
      : (TRANSCRIPTION_HOSTS[t.provider] ?? null);
  if (txHost) {
    add(
      {
        id: 'transcription',
        adapter: t.provider,
        host: txHost,
        fixes: ['local-whisper', 'off'],
        paths: ['transcription.provider', 'transcription.baseUrl'],
      },
      ['transcription.provider'],
    );
  }

  const l = c.llm;
  if (l.provider !== 'none' && l.provider !== 'mock') {
    const host = l.baseUrl
      ? isLocalUrl(l.baseUrl)
        ? null
        : hostOf(l.baseUrl)
      : l.provider === 'openai-compatible'
        ? null
        : (LLM_HOSTS[l.provider] ?? l.provider);
    if (host) {
      add(
        {
          id: 'llm',
          adapter: l.provider,
          host,
          fixes: ['local-ollama', 'off'],
          paths: ['llm.provider', 'llm.baseUrl'],
        },
        ['llm.provider'],
      );
    }
  }

  const providers = new Set(c.auth.providers);
  if (providers.has('google')) {
    add(
      {
        id: 'sign-in-google',
        adapter: 'google',
        host: 'accounts.google.com',
        fixes: ['off'],
        paths: ['auth.providers'],
      },
      ['auth.providers'],
    );
  }
  if (providers.has('github')) {
    add(
      {
        id: 'sign-in-github',
        adapter: 'github',
        host: 'github.com',
        fixes: ['off'],
        paths: ['auth.providers'],
      },
      ['auth.providers'],
    );
  }
  if (providers.has('email') && c.auth.email.server) {
    const host = smtpHost(c.auth.email.server);
    if (host && !isLocalHost(host)) {
      add(
        {
          id: 'sign-in-email',
          adapter: 'email',
          host,
          fixes: ['off'],
          paths: ['auth.providers', 'auth.email.server'],
        },
        ['auth.providers'],
      );
    }
  }
  if (c.auth.redirectProxyUrl && !isLocalUrl(c.auth.redirectProxyUrl)) {
    add(
      {
        id: 'auth-redirect-proxy',
        adapter: 'redirect-proxy',
        host: hostOf(c.auth.redirectProxyUrl) ?? '',
        fixes: ['this-instance'],
        paths: ['auth.redirectProxyUrl'],
      },
      ['auth.redirectProxyUrl'],
    );
  }
  if (!c.auth.localAccounts && c.appMode !== 'local') {
    add({
      id: 'local-accounts',
      adapter: 'local',
      host: '',
      fixes: ['local-accounts-on'],
      paths: ['auth.localAccounts'],
    });
  }

  if (c.blob.driver === 's3') {
    const { endpoint, region } = c.blob.s3;
    const host = endpoint
      ? isLocalUrl(endpoint)
        ? null
        : hostOf(endpoint)
      : `s3.${region ?? 'us-east-1'}.amazonaws.com`;
    if (host) {
      add({
        id: 'blob',
        adapter: 's3',
        host,
        fixes: ['local-folder'],
        paths: ['blob.driver', 'blob.s3.endpoint'],
      });
    }
  }

  if (c.db.driver === 'postgres' && c.db.url) {
    const host = hostOf(c.db.url);
    if (host && !isLocalHost(host)) {
      add({ id: 'database', adapter: 'postgres', host, fixes: [], paths: ['db.url'] });
    }
  }

  const tel = c.telemetry;
  const telemetryHost: Record<string, string | null> = {
    otel: tel.otel.endpoint ? hostOf(tel.otel.endpoint) : null,
    sentry: tel.sentryDsn ? hostOf(tel.sentryDsn) : null,
    posthog: hostOf(tel.posthog.host ?? POSTHOG_DEFAULT_HOST),
    umami: hostOf(tel.umami.host ?? UMAMI_DEFAULT_HOST),
  };
  for (const backend of tel.backends) {
    const host = telemetryHost[backend];
    if (host && !isLocalHost(host)) {
      add(
        {
          id: `telemetry-${backend}`,
          adapter: backend,
          host,
          fixes: ['off'],
          paths: ['telemetry.backends'],
        },
        ['telemetry.backends'],
      );
    }
  }
  return out;
}

type Json = Record<string, unknown>;

/** The config patch for one fix. `null` removes a setting. */
export function fixPatch(c: InstanceConfig, id: BlockerId, fix: FixId): Json | null {
  switch (fix) {
    case 'local-whisper':
      return id === 'transcription'
        ? { transcription: { provider: 'openai-compatible', baseUrl: LOCAL_WHISPER_URL } }
        : null;
    case 'local-ollama':
      return id === 'llm'
        ? {
            llm: {
              provider: 'openai-compatible',
              baseUrl: LOCAL_OLLAMA_URL,
              model: LOCAL_OLLAMA_MODEL,
              apiKey: null,
            },
          }
        : null;
    case 'local-folder':
      return id === 'blob' ? { blob: { driver: 'fs' } } : null;
    case 'local-accounts-on':
      return id === 'local-accounts' ? { auth: { localAccounts: true } } : null;
    case 'this-instance':
      if (id === 'auth-redirect-proxy') return { auth: { redirectProxyUrl: null } };
      return null;
    case 'off': {
      if (id === 'transcription') return { transcription: { provider: 'none' } };
      if (id === 'llm') return { llm: { provider: 'none' } };
      const signIn = {
        'sign-in-google': 'google',
        'sign-in-github': 'github',
        'sign-in-email': 'email',
      };
      if (id in signIn) {
        const drop = signIn[id as keyof typeof signIn];
        return { auth: { providers: c.auth.providers.filter((p) => p !== drop) } };
      }
      if (id.startsWith('telemetry-')) {
        const drop = id.slice('telemetry-'.length);
        return { telemetry: { backends: c.telemetry.backends.filter((b) => b !== drop) } };
      }
      return null;
    }
  }
}
