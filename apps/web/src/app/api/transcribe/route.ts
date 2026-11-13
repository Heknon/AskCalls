import { transcribe } from '@askcalls/api-contract/routes/providers';
import { transcribeChunk } from '@askcalls/domain/use-cases/providers';
import { route } from '../../../server/http/handler';

/**
 * Proxy transcription (spec 8). The chunk is held in memory only, streamed to the provider and
 * dropped: no disk, no blobs, no logs.
 */
export const POST = route(
  transcribe,
  async ({ ports, actor, query, raw, req }) => {
    try {
      const { result, usage } = await transcribeChunk(ports, actor, {
        audio: raw.bytes,
        mimeType: raw.contentType,
        language: query.language ?? 'auto',
        signal: req.signal,
      });
      return { ...result, usage };
    } finally {
      raw.bytes.fill(0);
    }
  },
  { rateLimit: { name: 'transcribe', limit: 60, windowMs: 60_000 } },
);
