import type { Ports } from '@askcalls/domain';
import { errorResponse, NO_STORE } from './errors';

const PER_MINUTE = 600;

function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

async function readExactly(req: Request, length: number): Promise<Uint8Array | null> {
  if (!req.body) return length === 0 ? new Uint8Array() : null;
  const out = new Uint8Array(length);
  let offset = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (offset + value.length > length) {
      await reader.cancel();
      return null;
    }
    out.set(value, offset);
    offset += value.length;
  }
  return offset === length ? out : null;
}

/**
 * Serves URLs the `fs` blob store presigns: `/api/blob/<key>?exp&len&sig`. The signature is the
 * authorization, as with S3 presigned URLs, so no session is needed. Bodies are ciphertext and
 * are never logged.
 */
export async function handleBlob(
  ports: Ports,
  req: Request,
  keyParts: string[],
): Promise<Response> {
  const store = ports.blobs;
  if (!store.verifyPresigned) return errorResponse(404, 'not_found', 'not found');
  const limit = await ports.rateLimiter.hit(`blob:${clientIp(req)}`, PER_MINUTE, 60_000);
  if (!limit.allowed) {
    const retry = Math.max(1, Math.ceil((limit.resetAt.getTime() - Date.now()) / 1000));
    return errorResponse(
      429,
      'rate_limited',
      'too many requests',
      {},
      { 'Retry-After': String(retry) },
    );
  }
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  const declared = req.headers.get('content-length');
  const contentLength = declared !== null && /^\d+$/.test(declared) ? Number(declared) : null;
  const verdict = await store.verifyPresigned({
    method,
    blobKey: keyParts.join('/'),
    query: new URL(req.url).searchParams,
    contentLength,
  });
  if (!verdict.ok) return errorResponse(403, 'forbidden', 'invalid or expired link');
  const key = keyParts.join('/');

  if (method === 'PUT') {
    if (contentLength === null) return errorResponse(411, 'invalid', 'content length required');
    const body = await readExactly(req, contentLength);
    if (!body) return errorResponse(400, 'invalid', 'body does not match its length');
    await store.put(key, body);
    return new Response(null, { status: 200, headers: NO_STORE });
  }

  const bytes = await store.get(key);
  if (!bytes) return errorResponse(404, 'not_found', 'not found');
  const headers = {
    ...NO_STORE,
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(bytes.length),
  };
  return new Response(req.method === 'HEAD' ? null : (bytes as Uint8Array<ArrayBuffer>), {
    status: 200,
    headers,
  });
}
