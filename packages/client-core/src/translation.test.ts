import type { Transcript } from '@askcalls/domain';
import { describe, expect, it } from 'vitest';
import type { Translator } from './ports/index';
import { needsTranslation } from './reindex';
import {
  missingTranslations,
  splitLong,
  translateInBatches,
  translateTranscript,
} from './translation';

const clock = { now: () => new Date('2026-06-15T12:00:00Z') };

describe('translateInBatches', () => {
  it('packs segments under the count and character caps and keeps order', async () => {
    const batches: string[][] = [];
    const out = await translateInBatches(
      ['aa', 'bbb', 'c', 'dddd', 'e'],
      async (b) => {
        batches.push(b);
        return b.map((s) => s.toUpperCase());
      },
      { segments: 2, chars: 5, segmentChars: 10 },
    );
    expect(out).toEqual(['AA', 'BBB', 'C', 'DDDD', 'E']);
    expect(batches).toEqual([['aa', 'bbb'], ['c', 'dddd'], ['e']]);
  });

  it('sends an over-long segment as pieces and joins them back into one', async () => {
    const long = 'one two three four five six';
    expect(splitLong(long, 10)).toEqual(['one two', 'three four', 'five six']);
    const out = await translateInBatches(['x', long], async (b) => b.map((s) => `[${s}]`), {
      segments: 10,
      chars: 100,
      segmentChars: 10,
    });
    expect(out).toEqual(['[x]', '[one two] [three four] [five six]']);
  });

  it('refuses a batch reply of the wrong length', async () => {
    await expect(translateInBatches(['a', 'b'], async () => ['only'])).rejects.toMatchObject({
      code: 'provider_error',
    });
  });
});

describe('translateTranscript', () => {
  const transcript: Transcript = {
    segments: [
      { start: 0, end: 2, speaker: 'A', text: 'שלום' },
      { start: 2, end: 5, speaker: 'B', text: 'מה המחיר?' },
    ],
    text: 'שלום\nמה המחיר?',
  };
  const translator: Translator = {
    id: 'test',
    async translate(segments, { target }) {
      return { segments: segments.map((s) => `${target}:${s} `), provider: 'p', model: 'm' };
    },
  };

  it('adds each missing language, aligned with the original', async () => {
    const he = await translateTranscript(translator, transcript, 'he', { clock });
    expect(Object.keys(he.translations!)).toEqual(['en']);
    expect(he.translations!.en).toEqual({
      segments: [
        { start: 0, end: 2, speaker: 'A', text: 'en:שלום' },
        { start: 2, end: 5, speaker: 'B', text: 'en:מה המחיר?' },
      ],
      text: 'en:שלום\nen:מה המחיר?',
      provider: 'p',
      model: 'm',
      createdAt: '2026-06-15T12:00:00.000Z',
    });
    const ar = await translateTranscript(translator, transcript, 'ar', { clock });
    expect(Object.keys(ar.translations!).sort()).toEqual(['en', 'he']);
    expect(missingTranslations(ar, 'ar')).toEqual([]);
  });

  it('refuses a translator reply that is not aligned', async () => {
    const bad: Translator = {
      id: 'bad',
      translate: async () => ({ segments: ['one'], provider: 'p', model: 'm' }),
    };
    await expect(translateTranscript(bad, transcript, 'he', { clock })).rejects.toMatchObject({
      code: 'provider_error',
    });
  });
});

describe('needsTranslation', () => {
  it('reads the metadata only', () => {
    expect(needsTranslation({ language: 'he', translatedTo: ['en'] })).toBe(false);
    expect(needsTranslation({ language: 'en', translatedTo: [] })).toBe(true);
    expect(needsTranslation({ language: 'ar', translatedTo: ['en'] })).toBe(true);
    expect(needsTranslation({ language: 'he' })).toBe(true);
  });
});
