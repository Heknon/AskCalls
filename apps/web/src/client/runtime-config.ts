/**
 * Per-instance settings the server renders into the page (app/app/layout.tsx) rather than
 * baking into the bundle, so one build serves any instance.
 */
export const EMBEDDING_MODEL_URL_META = 'askcalls-embedding-model-url';

/** The instance's embedding model host, or null for this origin's /models/. */
export function readEmbeddingModelUrl(
  doc: Document | undefined = globalThis.document,
): string | null {
  const v = doc?.querySelector(`meta[name="${EMBEDDING_MODEL_URL_META}"]`)?.getAttribute('content');
  return v ? v : null;
}

export const CONNECT_SRC_META = 'askcalls-connect-src';

/** The `connect-src` sources of a CSP header value; null without that directive. */
export function connectSrcOf(csp: string | null): string[] | null {
  const directive = (csp ?? '')
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find(([name]) => name === 'connect-src');
  return directive ? directive.slice(1) : null;
}

/** The `connect-src` this document was served with, or null when the page has no meta. */
export function readConnectSrc(doc: Document | undefined = globalThis.document): string[] | null {
  const v = doc?.querySelector(`meta[name="${CONNECT_SRC_META}"]`)?.getAttribute('content');
  return v == null ? null : v.split(/\s+/).filter(Boolean);
}
