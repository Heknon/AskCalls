import type { BlobFetcher, RecordingUploader } from '@askcalls/client-core/ports/index';
import { sendWithRetry } from '@askcalls/client-core/retry';
import { DomainError } from '@askcalls/domain';

export type Progress = (loaded: number, total: number | null) => void;

/** Reads a response body as it streams, into one buffer (sized by Content-Length when sent). */
export async function readBody(res: Response, onProgress?: Progress): Promise<Uint8Array> {
  const header = res.headers.get('content-length');
  const total = header && /^\d+$/.test(header) ? Number(header) : null;
  if (!res.body) {
    const b = new Uint8Array(await res.arrayBuffer());
    onProgress?.(b.length, b.length);
    return b;
  }
  const reader = res.body.getReader();
  let buf = new Uint8Array(total ?? 1 << 20);
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (n + value.length > buf.length) {
      const next = new Uint8Array(Math.max(buf.length * 2, n + value.length));
      next.set(buf.subarray(0, n));
      buf = next;
    }
    buf.set(value, n);
    n += value.length;
    onProgress?.(n, total);
  }
  return n === buf.length ? buf : buf.slice(0, n);
}

/** Throws a content-free error for a non-2xx blob response; the body is discarded unread. */
export async function assertOk(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  await res.body?.cancel().catch(() => {});
  throw new DomainError(
    res.status === 404 ? 'not_found' : 'provider_error',
    `${what} returned HTTP ${res.status}`,
    { status: res.status },
  );
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
const defaultFetch: Fetch = (input, init) => fetch(input, init);

/** Network failures, including CORS rejections, which the browser reports as a TypeError. */
async function send(fetchImpl: Fetch, url: string, init: RequestInit, what: string) {
  try {
    return await fetchImpl(url, { ...init, credentials: 'omit', cache: 'no-store' });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new DomainError('provider_error', `${what} unreachable (network or CORS)`, {
      status: null,
    });
  }
}

/**
 * Presigned PUT of ciphertext to the instance bucket. S3 needs a Content-Length, so the body is
 * sent as bytes rather than a streamed (chunked) request.
 */
export class FetchRecordingUploader implements RecordingUploader {
  constructor(
    private readonly fetchImpl: Fetch = defaultFetch,
    private readonly onProgress?: Progress,
  ) {}

  async put(
    request: { url: string; method: 'PUT'; headers: Record<string, string> },
    body: Uint8Array,
  ): Promise<void> {
    const res = await sendWithRetry(() =>
      send(
        this.fetchImpl,
        request.url,
        { method: 'PUT', headers: request.headers, body: body as BodyInit },
        'recording upload',
      ),
    );
    await assertOk(res, 'recording upload');
    await res.body?.cancel().catch(() => {});
    this.onProgress?.(body.length, body.length);
  }
}

/** Presigned GET of ciphertext, read as it streams. */
export class FetchBlobFetcher implements BlobFetcher {
  constructor(
    private readonly fetchImpl: Fetch = defaultFetch,
    private readonly onProgress?: Progress,
  ) {}

  async get(request: { url: string; headers?: Record<string, string> }): Promise<Uint8Array> {
    const res = await sendWithRetry(() =>
      send(
        this.fetchImpl,
        request.url,
        { method: 'GET', headers: request.headers ?? {} },
        'blob download',
      ),
    );
    return readBody(await assertOk(res, 'blob download'), this.onProgress);
  }
}
