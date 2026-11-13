import type { InstanceConfig } from '../config/schema';

/**
 * Own-key provider origins the browser may call directly (spec 11.2a). Custom OpenAI-compatible
 * base URLs are user data (encrypted), so they can't be listed; those go through the agent.
 */
export const DIRECT_PROVIDER_ORIGINS = [
  'https://api.elevenlabs.io',
  'https://api.openai.com',
  'https://api.deepgram.com',
  'https://api.soniox.com',
  'https://api.anthropic.com',
  'https://generativelanguage.googleapis.com',
];

/** Origins presigned recording URLs point at (path-style and virtual-hosted S3). */
export function blobOrigins(config: InstanceConfig): string[] {
  if (config.blob.driver !== 's3') return [];
  const { endpoint, bucket, region } = config.blob.s3;
  const out: string[] = [];
  if (endpoint) {
    const url = new URL(endpoint);
    out.push(url.origin);
    if (bucket) out.push(`${url.protocol}//${bucket}.${url.host}`);
  } else if (bucket && region) {
    out.push(`https://${bucket}.s3.${region}.amazonaws.com`, `https://s3.${region}.amazonaws.com`);
  }
  return out;
}

/**
 * The instance's embedding model host, or null for this origin (unset, or offline mode, which
 * always serves the model itself).
 */
export function embeddingModelUrl(config: InstanceConfig): string | null {
  return config.offlineMode ? null : (config.embeddingModelUrl ?? null);
}

function embeddingModelOrigins(config: InstanceConfig): string[] {
  const url = embeddingModelUrl(config);
  return url ? [new URL(url).origin] : [];
}

export function newNonce(): string {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b));
}

/**
 * Strict CSP for /app/** and /admin/** (spec 2.4): no third-party scripts, inline scripts only
 * with this request's nonce (Next.js bootstrap), `strict-dynamic` for the chunks it loads.
 */
export function appCsp(
  config: InstanceConfig,
  nonce: string,
  environment: 'production' | 'development' | 'test',
): string {
  const connect = ["'self'", ...blobOrigins(config), ...embeddingModelOrigins(config)];
  if (!config.offlineMode) connect.push(...DIRECT_PROVIDER_ORIGINS);
  const script = ["'self'", `'nonce-${nonce}'`, "'wasm-unsafe-eval'", "'strict-dynamic'"];
  // React Refresh in `next dev` needs eval; never in production.
  if (environment === 'development') script.push("'unsafe-eval'");
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    "style-src 'self'",
    "img-src 'self' blob: data:",
    `media-src 'self' blob: ${blobOrigins(config).join(' ')}`.trim(),
    "font-src 'self'",
    `connect-src ${[...new Set(connect)].join(' ')}`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
