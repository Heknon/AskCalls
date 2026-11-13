import type { Transcript } from '@askcalls/domain';
import { describe, expect, it } from 'vitest';
import type { Translator } from './ports/index';
import { needsTranslation } from './reindex';
import {
  splitLong,
  translateInBatches,
  translateTranscript,
  translationPlan,
  withoutTranslations,
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

  it('adds each target language, aligned with the original', async () => {
    const he = await translateTranscript(translator, transcript, 'he', ['en', 'he'], { clock });
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
    const ru = await translateTranscript(translator, transcript, 'he', ['ru'], { clock });
    expect(Object.keys(ru.translations!)).toEqual(['ru']);
    expect(ru.translations!.ru!.segments[1]!.text).toBe('ru:מה המחיר?');
  });

  it('plans additions and removals from the rules', async () => {
    const both = await translateTranscript(translator, transcript, 'he', ['en', 'ru'], { clock });
    expect(translationPlan(both, 'he', [{ from: 'he', to: ['ru', 'ar'] }])).toEqual({
      missing: ['ar'],
      extra: ['en'],
    });
    expect(translationPlan(both, 'he', [])).toEqual({ missing: [], extra: ['en', 'ru'] });
    expect(Object.keys(withoutTranslations(both, ['en']).translations!)).toEqual(['ru']);
  });

  it('skips a failing language and keeps the others when asked to', async () => {
    const flaky: Translator = {
      id: 'flaky',
      async translate(segments, { target }) {
        if (target === 'en') throw new Error('quota');
        return { segments: segments.map((s) => s), provider: 'p', model: 'm' };
      },
    };
    const failed: string[] = [];
    const out = await translateTranscript(flaky, transcript, 'he', ['en', 'ru'], {
      clock,
      onError: (l) => failed.push(l),
    });
    expect(failed).toEqual(['en']);
    expect(Object.keys(out.translations!)).toEqual(['ru']);
  });

  it('refuses a translator reply that is not aligned', async () => {
    const bad: Translator = {
      id: 'bad',
      translate: async () => ({ segments: ['one'], provider: 'p', model: 'm' }),
    };
    await expect(
      translateTranscript(bad, transcript, 'he', ['en'], { clock }),
    ).rejects.toMatchObject({
      code: 'provider_error',
    });
  });
});

describe('needsTranslation', () => {
  it('compares the metadata with the rules', () => {
    const heEn = [{ from: 'he', to: ['en'] }];
    expect(needsTranslation({ language: 'he', translatedTo: ['en'] }, heEn)).toBe(false);
    expect(needsTranslation({ language: 'en', translatedTo: [] }, heEn)).toBe(false);
    expect(needsTranslation({ language: 'he', translatedTo: [] }, heEn)).toBe(true);
    expect(needsTranslation({ language: 'he', translatedTo: ['en', 'ru'] }, heEn)).toBe(true);
    expect(needsTranslation({ language: 'he' }, heEn)).toBe(true);
    expect(needsTranslation({ language: 'en' }, heEn)).toBe(false);
    expect(needsTranslation({ language: 'he', translatedTo: ['en'] }, [])).toBe(true);
    expect(
      needsTranslation({ language: 'he', translatedTo: ['ru'] }, [{ from: 'he', to: ['ru'] }]),
    ).toBe(false);
  });
});
