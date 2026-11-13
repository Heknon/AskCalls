import { describe, expect, it } from 'vitest';
import { meaningHighlights, phraseRanges } from './meaning';
import type { Embedder } from './ports';

const slices = (text: string) => phraseRanges(text).map((r) => text.slice(r.start, r.end));

describe('phraseRanges', () => {
  it('splits at clause punctuation and drops the mark that ends a phrase', () => {
    expect(slices('Hi there. Can we meet Thursday at the showroom? Sure, see you')).toEqual([
      'Hi there',
      'Can we meet Thursday at the showroom',
      'Sure, see you',
    ]);
  });

  it('cuts a long clause into pieces', () => {
    const text = Array.from({ length: 20 }, (_, i) => `w${i}`).join(' ');
    expect(slices(text).map((s) => s.split(' ').length)).toEqual([8, 8, 4]);
  });

  it('works on Hebrew', () => {
    expect(slices('שלום, מדברת נועה. היינו אצלכם באולם התצוגה ביום חמישי')).toEqual([
      'שלום, מדברת נועה',
      'היינו אצלכם באולם התצוגה ביום חמישי',
    ]);
  });
});

describe('meaningHighlights', () => {
  // A toy embedder: one axis per topic word.
  const topics = ['meet', 'price'];
  const vec = (t: string) => Float32Array.from(topics.map((w) => (t.includes(w) ? 1 : 0.01)));
  const embedder: Embedder = {
    modelId: 'toy',
    dimensions: 384,
    embed: async (texts) => texts.map(vec),
  };

  it('marks the phrase closest to the query in each snippet', async () => {
    const snippets = [
      'The price is fine. We should meet on Sunday at noon. Bye now',
      'One phrase only about meet',
      null,
    ];
    const out = await meaningHighlights(embedder, vec('meet'), snippets);
    expect(out[0] && snippets[0]!.slice(out[0].start, out[0].end)).toBe(
      'We should meet on Sunday at noon',
    );
    expect(out[1]).toBeNull();
    expect(out[2]).toBeNull();
  });

  it('never marks a phrase under three words', async () => {
    const snippets = [
      'Fine, meet. We should meet on Sunday at noon. Bye now',
      'Right? Exactly. Of course',
    ];
    const out = await meaningHighlights(embedder, vec('meet'), snippets);
    expect(out[0] && snippets[0]!.slice(out[0].start, out[0].end)).toBe(
      'We should meet on Sunday at noon',
    );
    expect(out[1]).toBeNull();
  });
});
