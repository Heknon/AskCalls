import type { BlobFetcher, RecordingUploader } from '@askcalls/client-core/ports/index';
import {
  assertOk,
  defaultFetch,
  type Fetch,
  type Progress,
  readBody,
  send,
} from '@askcalls/client-core/recording-stores/http';
import { sendWithRetry } from '@askcalls/client-core/retry';

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
