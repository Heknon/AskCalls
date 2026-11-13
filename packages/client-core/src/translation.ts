import type { ApiClient } from '@askcalls/api-contract';
import { translate } from '@askcalls/api-contract/routes/providers';
import {
  DomainError,
  type Transcript,
  type TranscriptTranslation,
  type TranslationLanguage,
  translationTargets,
} from '@askcalls/domain';
import type { Clock, TranslationResult, Translator } from './ports/index';

/** `POST /api/translate` bounds (PROVIDER_LIMITS): one batch per request. */
export const TRANSLATE_BATCH = { segments: 120, chars: 20_000, segmentChars: 4_000 } as const;

/** Splits a long segment at whitespace into pieces of at most `max` characters. */
export function splitLong(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const space = rest.lastIndexOf(' ', max);
    const cut = space > max / 2 ? space : max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Packs segment texts into request-sized batches. A segment longer than the per-segment cap is
 * sent as several pieces and joined again, so the result always has one string per segment.
 */
export async function translateInBatches(
  segments: readonly string[],
  send: (batch: string[]) => Promise<string[]>,
  limits: { segments: number; chars: number; segmentChars: number } = TRANSLATE_BATCH,
): Promise<string[]> {
  const pieces: Array<{ seg: number; text: string }> = [];
  segments.forEach((s, seg) => {
    for (const text of splitLong(s, limits.segmentChars)) pieces.push({ seg, text });
  });
  const translated: string[] = [];
  let batch: string[] = [];
  let chars = 0;
  const flush = async () => {
    if (!batch.length) return;
    const out = await send(batch);
    if (out.length !== batch.length) {
      throw new DomainError('provider_error', 'translation reply did not match the segments');
    }
    translated.push(...out);
    batch = [];
    chars = 0;
  };
  for (const p of pieces) {
    if (batch.length >= limits.segments || chars + p.text.length > limits.chars) await flush();
    batch.push(p.text);
    chars += p.text.length;
  }
  await flush();
  const out = segments.map(() => '');
  pieces.forEach((p, i) => {
    out[p.seg] = out[p.seg] ? `${out[p.seg]} ${translated[i]}` : translated[i]!;
  });
  return out;
}

/** Managed mode: batches go through `POST /api/translate`, in transit only, never stored. */
export function managedTranslator(api: ApiClient): Translator {
  return {
    id: 'managed',
    async translate(segments, { source, target, signal }) {
      let provider = 'managed';
      let model = '';
      const out = await translateInBatches(segments, async (batch) => {
        signal?.throwIfAborted();
        const res = await api.request(translate, { body: { segments: batch, source, target } });
        provider = res.provider;
        model = res.model;
        return res.segments;
      });
      return { segments: out, provider, model };
    },
  };
}

/** The languages `transcript` still lacks, given the original's language. */
export function missingTranslations(
  transcript: Pick<Transcript, 'translations'>,
  language: string | null,
): TranslationLanguage[] {
  return translationTargets(language).filter((l) => !transcript.translations?.[l]);
}

/**
 * Adds every missing translation to the transcript. Each one is aligned with the original:
 * same segment count, timings and speakers, only the text translated.
 */
export async function translateTranscript(
  translator: Translator,
  transcript: Transcript,
  language: string | null,
  opts: { clock: Clock; signal?: AbortSignal },
): Promise<Transcript> {
  const translations = { ...transcript.translations };
  const texts = transcript.segments.map((s) => s.text);
  for (const target of missingTranslations(transcript, language)) {
    const result: TranslationResult = await translator.translate(texts, {
      source: language,
      target,
      ...(opts.signal && { signal: opts.signal }),
    });
    if (result.segments.length !== texts.length) {
      throw new DomainError('provider_error', 'translation reply did not match the segments');
    }
    translations[target] = alignedTranslation(transcript, result, opts.clock.now());
  }
  return { ...transcript, translations };
}

function alignedTranslation(
  transcript: Transcript,
  result: TranslationResult,
  now: Date,
): TranscriptTranslation {
  const segments = transcript.segments.map((s, i) => ({ ...s, text: result.segments[i]!.trim() }));
  return {
    segments,
    text: segments.map((s) => s.text).join('\n'),
    provider: result.provider,
    model: result.model,
    createdAt: now.toISOString(),
  };
}
