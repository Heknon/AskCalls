import type { BlobFetcher, RecordingUploader } from '@askcalls/client-core';
import { sendWithRetry } from '@askcalls/client-core/retry';
import { DomainError } from '@askcalls/domain';

/** Presigned PUTs (recording backups) and GETs (recordings, large inbox payloads) via fetch. */
export function fetchBlobTransport(doFetch: typeof fetch = fetch): RecordingUploader & BlobFetcher {
  return {
    async put(request, body) {
      const res = await sendWithRetry(() =>
        doFetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: body as BodyInit,
        }),
      );
      if (!res.ok)
        throw new DomainError('provider_error', 'blob upload failed', { status: res.status });
    },
    async get(request) {
      const res = await sendWithRetry(() =>
        doFetch(request.url, { headers: request.headers ?? {} }),
      );
      if (!res.ok)
        throw new DomainError('provider_error', 'blob download failed', { status: res.status });
      return new Uint8Array(await res.arrayBuffer());
    },
  };
}
