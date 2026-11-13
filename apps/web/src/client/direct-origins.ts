/**
 * Origins the browser may call directly in own-key mode (spec 2.4, 11.2a), shared by the client
 * (which records what the user enabled) and the middleware (which builds `connect-src`).
 *
 * The provider choice and the own bucket's endpoint live in the encrypted providers document,
 * which the server cannot read. After unlock the client mirrors only the origins into the
 * `askcalls-direct` cookie: provider ids and bucket/endpoint origins, never keys, never content.
 * Without the cookie, `connect-src` carries no provider origins at all.
 */

export const DIRECT_COOKIE = 'askcalls-direct';
/** On HTTPS the cookie is `__Host-` prefixed, so a sibling subdomain cannot plant one. */
export const DIRECT_COOKIE_SECURE = `__Host-${DIRECT_COOKIE}`;

/**
 * The cookie value the middleware trusts: the `__Host-` cookie when present, the plain one only
 * on plain-HTTP requests (local development).
 */
export function readDirectCookie(
  get: (name: string) => string | undefined,
  secureRequest: boolean,
): string | undefined {
  return get(DIRECT_COOKIE_SECURE) ?? (secureRequest ? undefined : get(DIRECT_COOKIE));
}

/** Fixed origins of the providers whose adapters call the API from the browser. */
export const PROVIDER_ORIGINS: Readonly<Record<string, readonly string[]>> = {
  elevenlabs: ['https://api.elevenlabs.io'],
  openai: ['https://api.openai.com'],
  deepgram: ['https://api.deepgram.com'],
  soniox: ['https://api.soniox.com'],
  anthropic: ['https://api.anthropic.com'],
  google: ['https://generativelanguage.googleapis.com'],
};

/** Every origin `PROVIDER_ORIGINS` names. */
export const ALL_PROVIDER_ORIGINS: readonly string[] = [
  ...new Set(Object.values(PROVIDER_ORIGINS).flat()),
];

const MAX_CUSTOM_ORIGINS = 4;

export interface DirectAccess {
  /** Provider ids from `PROVIDER_ORIGINS`. */
  providers: string[];
  /** User-configured origins: own bucket, OpenAI-compatible base URL. */
  origins: string[];
}

/** `https://host[:port]`, or plain http for loopback (a local MinIO or Whisper server). */
export function normalizeOrigin(value: string): string | null {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return null;
  if (u.username || u.password) return null;
  return u.origin;
}

export function encodeDirectCookie(access: DirectAccess): string {
  const q = new URLSearchParams();
  const providers = access.providers.filter((p) => p in PROVIDER_ORIGINS);
  if (providers.length) q.set('p', [...new Set(providers)].join('.'));
  const origins = access.origins
    .map(normalizeOrigin)
    .filter((o): o is string => o !== null)
    .slice(0, MAX_CUSTOM_ORIGINS);
  for (const o of new Set(origins)) q.append('o', o);
  return q.toString();
}

export function parseDirectCookie(value: string | null | undefined): DirectAccess {
  if (!value || value.length > 2_048) return { providers: [], origins: [] };
  const q = new URLSearchParams(value);
  const providers = (q.get('p') ?? '').split('.').filter((p) => p in PROVIDER_ORIGINS);
  const origins = q
    .getAll('o')
    .map(normalizeOrigin)
    .filter((o): o is string => o !== null)
    .slice(0, MAX_CUSTOM_ORIGINS);
  return { providers: [...new Set(providers)], origins: [...new Set(origins)] };
}

/** The origins a cookie value allows. */
export function directOrigins(cookie: string | null | undefined): string[] {
  const a = parseDirectCookie(cookie);
  return [...new Set([...a.providers.flatMap((p) => PROVIDER_ORIGINS[p]!), ...a.origins])];
}

/**
 * Rewrites `connect-src` in a CSP: drops every origin in `remove`, then adds `add`. Other
 * directives are untouched.
 */
export function rewriteConnectSrc(
  csp: string,
  remove: readonly string[],
  add: readonly string[],
): string {
  return csp
    .split('; ')
    .map((d) => {
      if (!d.startsWith('connect-src ')) return d;
      const kept = d
        .slice('connect-src '.length)
        .split(' ')
        .filter((s) => s && !remove.includes(s));
      return `connect-src ${[...new Set([...kept, ...add])].join(' ')}`;
    })
    .join('; ');
}
