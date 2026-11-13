import type { ApiClient } from '@askcalls/api-contract';
import { transcribe } from '@askcalls/api-contract/routes/providers';
import type { TranscriptSegment } from '@askcalls/domain';
import type { AudioCodec, DecodedAudio, Transcriber, TranscriptionResult } from './ports/index';

/** Spec 8: chunks of at most 3.5 MB of Opus at 24 kbps. */
export const TRANSCRIBE_CHUNK_BYTES = 3.5 * 1024 * 1024;
export const TRANSCRIBE_BITRATE_KBPS = 24;
/** Spec 8 step 7: recording backups are Opus 32 kbps mono. */
export const RECORDING_BITRATE_KBPS = 32;

/** Managed mode: each chunk goes through `POST /api/transcribe`, streamed and never stored. */
export function managedTranscriber(api: ApiClient): Transcriber {
  return {
    id: 'managed',
    maxChunkBytes: 4 * 1024 * 1024,
    async transcribe(chunk, { language }) {
      const res = await api.request(transcribe, {
        query: { language },
        raw: { bytes: chunk.bytes, contentType: chunk.mimeType.split(';')[0]! },
      });
      return { segments: res.segments, language: res.language, durationSec: res.durationSec };
    },
  };
}

/** Encodes, chunks and transcribes decoded audio; chunk timestamps are offset and merged. */
export async function transcribeAudio(
  codec: AudioCodec,
  transcriber: Transcriber,
  audio: DecodedAudio,
  language: string,
): Promise<TranscriptionResult> {
  const chunks = await codec.chunk(audio, {
    maxBytes: Math.min(TRANSCRIBE_CHUNK_BYTES, transcriber.maxChunkBytes),
    bitrateKbps: TRANSCRIBE_BITRATE_KBPS,
  });
  const segments: TranscriptSegment[] = [];
  let detected: string | null = null;
  for (const chunk of chunks) {
    const r = await transcriber.transcribe(chunk, { language });
    detected ??= r.language;
    for (const s of r.segments) {
      segments.push({ ...s, start: s.start + chunk.startSec, end: s.end + chunk.startSec });
    }
  }
  return { segments, language: detected, durationSec: audio.durationSec };
}
