import { describe, expect, it } from 'vitest';
import { ABOVE_MEDIAN, BACKGROUND, MARGIN, MIN_SCORED_CALLS, meaningFloor } from './meaning-floor';
import type { Embedder } from './ports';

const unit = (i: number) => {
  const v = new Float32Array(384);
  v[i] = 1;
  return v;
};

function embedder(
  minSimilarity: number | undefined,
  smallTalk: Float32Array,
): Embedder & { calls: number } {
  return {
    modelId: 'stub',
    dimensions: 384,
    calls: 0,
    ...(minSimilarity !== undefined && { minSimilarity }),
    async embed(texts) {
      this.calls++;
      return texts.map(() => smallTalk);
    },
  };
}

describe('meaningFloor', () => {
  it('keeps every hit when the embedder has no calibrated floor', async () => {
    expect(await meaningFloor(embedder(undefined, unit(0)), unit(0))).toBeUndefined();
  });

  it("is the query's small-talk score plus the margin, never under the model floor", async () => {
    const close = new Float32Array(384);
    close[0] = 0.9;
    close[1] = Math.sqrt(1 - 0.81);
    const floor = (await meaningFloor(embedder(0.78, close), unit(0)))!;
    expect(floor('he')).toBeCloseTo(0.9 + MARGIN, 5);
    expect(floor(null)).toBeCloseTo(0.9 + MARGIN, 5);
    expect((await meaningFloor(embedder(0.78, unit(1)), unit(0)))!('en')).toBe(0.78);
  });

  it('embeds the small talk once per embedder', async () => {
    const e = embedder(0.78, unit(1));
    await meaningFloor(e, unit(0));
    await meaningFloor(e, unit(2));
    expect(e.calls).toBe(1);
    expect(Object.keys(BACKGROUND)).toEqual(['en', 'he']);
  });

  it("sets each language's bar from small talk in that language", async () => {
    const near = new Float32Array(384);
    near[0] = 0.85;
    near[1] = Math.sqrt(1 - 0.85 ** 2);
    const e: Embedder = {
      modelId: 'stub',
      dimensions: 384,
      minSimilarity: 0.78,
      async embed(texts) {
        return texts.map((t) => (/[\u0590-\u05FF]/.test(t) ? near : unit(1)));
      },
    };
    const floor = (await meaningFloor(e, unit(0)))!;
    expect(floor('he')).toBeCloseTo(0.85 + MARGIN, 5);
    expect(floor('en')).toBe(0.78);
    expect(floor('ar')).toBeCloseTo(0.85 + MARGIN, 5);
  });

  it("raises the bar to the query's median over the user's calls once there are enough", async () => {
    const e = embedder(0.78, unit(1));
    const few = (await meaningFloor(e, unit(0), {
      median: 0.83,
      scoredCalls: MIN_SCORED_CALLS - 1,
    }))!;
    expect(few('he')).toBe(0.78);
    const many = (await meaningFloor(e, unit(0), { median: 0.83, scoredCalls: MIN_SCORED_CALLS }))!;
    expect(many('he')).toBeCloseTo(0.83 + ABOVE_MEDIAN, 5);
    expect(many(null)).toBeCloseTo(0.83 + ABOVE_MEDIAN, 5);
    const low = (await meaningFloor(e, unit(0), { median: 0.5, scoredCalls: 40 }))!;
    expect(low('en')).toBe(0.78);
  });
});
