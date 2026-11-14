import { describe, expect, it } from 'vitest';
import { createFakeEmbedder, fakeEmbedVector } from '../test/fake-embedder';
import {
  BUILT_IN_INTENTS,
  buildIntentPrototypes,
  classifyIntents,
  cosine,
  DEFAULT_INTENT_MARGIN,
  DEFAULT_INTENT_THRESHOLD,
  IntentDefinitionSchema,
  intentMargin,
  l2normalize,
  meanVector,
} from './intents';
import { NEUTRAL_EXAMPLES } from './neutral';

const vec = (...xs: number[]) => Float32Array.from(xs);

describe('vector math', () => {
  it('cosine', () => {
    expect(cosine(vec(1, 0), vec(1, 0))).toBeCloseTo(1);
    expect(cosine(vec(1, 0), vec(0, 1))).toBeCloseTo(0);
    expect(cosine(vec(1, 1), vec(2, 2))).toBeCloseTo(1);
    expect(cosine(vec(0, 0), vec(1, 0))).toBe(0);
    expect(() => cosine(vec(1), vec(1, 2))).toThrow(RangeError);
  });
  it('l2normalize and meanVector', () => {
    expect([...l2normalize(vec(3, 4))]).toEqual([0.6000000238418579, 0.800000011920929]);
    const m = meanVector([vec(10, 0), vec(0, 1)]);
    // Examples are normalized before averaging, so magnitude does not dominate.
    expect(m[0]).toBeCloseTo(m[1]!);
    expect(cosine(m, vec(1, 1))).toBeCloseTo(1);
  });
});

describe('built-in intents', () => {
  it('has the seven spec intents with 8–12 Hebrew and English examples each', () => {
    expect(BUILT_IN_INTENTS.map((i) => i.id)).toEqual([
      'purchase_interest',
      'price_question',
      'complaint',
      'service_request',
      'scheduling',
      'legal',
      'follow_up',
    ]);
    for (const intent of BUILT_IN_INTENTS) {
      expect(IntentDefinitionSchema.safeParse(intent).success).toBe(true);
      expect(intent.examples.length).toBeGreaterThanOrEqual(8);
      expect(intent.examples.length).toBeLessThanOrEqual(12);
      expect(intent.examples.some((e) => /[א-ת]/.test(e))).toBe(true);
      expect(intent.examples.some((e) => /[a-z]/i.test(e))).toBe(true);
    }
  });
});

describe('buildIntentPrototypes', () => {
  it('embeds every example and the small-talk baseline once, in one batch', async () => {
    const fake = createFakeEmbedder();
    const protos = await buildIntentPrototypes(BUILT_IN_INTENTS, fake.embed);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toHaveLength(
      BUILT_IN_INTENTS.reduce((n, i) => n + i.examples.length, 0) + NEUTRAL_EXAMPLES.length,
    );
    expect(fake.calls[0]!.every((t) => t.startsWith('passage: '))).toBe(true);
    expect(protos.map((p) => p.id)).toEqual(BUILT_IN_INTENTS.map((i) => i.id));
    for (const p of protos) {
      const norm = Math.sqrt(p.vector.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1, 5);
      expect(p.neutral).toBe(protos[0]!.neutral);
    }
  });

  it('keeps per-intent thresholds and rejects a short embedder response', async () => {
    const protos = await buildIntentPrototypes(
      [{ id: 'refund', examples: ['refund please'], threshold: 0.5 }],
      createFakeEmbedder().embed,
    );
    expect(protos[0]!.threshold).toBe(0.5);
    await expect(
      buildIntentPrototypes([{ id: 'x', examples: ['a', 'b'] }], async () => []),
    ).rejects.toThrow(RangeError);
    expect(await buildIntentPrototypes([], createFakeEmbedder().embed)).toEqual([]);
  });
});

describe('classifyIntents', () => {
  // Small talk sits on the fourth axis; intents on the first three.
  const neutral = vec(0, 0, 0, 1);
  const protos = [
    { id: 'a', vector: vec(1, 0, 0, 0), neutral },
    { id: 'b', vector: vec(0, 1, 0, 0), neutral },
    { id: 'c', vector: vec(0, 0, 1, 0), neutral, threshold: 0.3 },
  ];

  it('tags an intent when a chunk is closer to it than to small talk by the margin', () => {
    const chunks = [l2normalize(vec(0.9, 0.1, 0, 0.3)), l2normalize(vec(0.2, 0.3, 0.7, 0.65))];
    const out = classifyIntents(chunks, protos, { minSimilarity: 0 });
    expect(out.map((m) => m.id)).toEqual(['a', 'c']);
    expect(out[0]!.chunkOrd).toBe(0);
    expect(out[0]!.score).toBeGreaterThanOrEqual(DEFAULT_INTENT_MARGIN);
    expect(out[1]!.chunkOrd).toBe(1);
  });

  it('never tags small talk, however close it is to every intent', () => {
    const chatter = [l2normalize(vec(0.5, 0.5, 0.5, 0.6)), l2normalize(vec(0.4, 0.4, 0.4, 0.7))];
    expect(classifyIntents(chatter, protos.slice(0, 2), { minSimilarity: 0 })).toEqual([]);
  });

  it('needs the chunk to be close to the intent, not only closer than to small talk', () => {
    const far = [l2normalize(vec(0.3, 0, 0, 0.1))];
    expect(classifyIntents(far, protos.slice(0, 1), { minSimilarity: 0 })).toHaveLength(1);
    expect(
      classifyIntents(
        far.map((v) => v.map((x) => x * 0.1 + 0.5)),
        protos.slice(0, 1),
      ),
    ).toEqual([]);
  });

  it('maps the strictness setting to the margin', () => {
    expect(intentMargin(DEFAULT_INTENT_THRESHOLD)).toBeCloseTo(DEFAULT_INTENT_MARGIN);
    expect(intentMargin(0.87) - intentMargin(0.82)).toBeCloseTo(0.005);
    const chunks = [l2normalize(vec(0.53, 0.515, 0, 0.5))];
    const loose = { minSimilarity: 0 };
    expect(classifyIntents(chunks, protos.slice(0, 2), loose).map((m) => m.id)).toEqual(['a', 'b']);
    expect(
      classifyIntents(chunks, protos.slice(0, 2), { ...loose, threshold: 0.95 }).map((m) => m.id),
    ).toEqual(['a']);
  });

  it('returns nothing without chunks or prototypes', () => {
    expect(classifyIntents([], protos)).toEqual([]);
    expect(classifyIntents([vec(1, 0, 0)], [])).toEqual([]);
  });

  it('end to end with user-defined intents and the fake embedder', async () => {
    const fake = createFakeEmbedder();
    const protos = await buildIntentPrototypes(
      [
        {
          id: 'refund',
          examples: ['אני רוצה החזר כספי', 'refund my money please', 'החזר כספי על ההזמנה'],
        },
        { id: 'delivery', examples: ['מתי המשלוח מגיע', 'where is my delivery', 'המשלוח מתעכב'] },
      ],
      fake.embed,
    );
    const chunk = fakeEmbedVector('passage: שלום, אני רוצה החזר כספי על ההזמנה, refund my money');
    const out = classifyIntents([chunk], protos, { threshold: 0.6 });
    expect(out.map((m) => m.id)).toEqual(['refund']);
  });
});
