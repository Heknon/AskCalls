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
