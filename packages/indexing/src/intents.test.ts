import { describe, expect, it } from 'vitest';
import { createFakeEmbedder, fakeEmbedVector } from '../test/fake-embedder';
import {
  BUILT_IN_INTENTS,
  buildIntentPrototypes,
  classifyIntents,
  cosine,
  DEFAULT_INTENT_THRESHOLD,
  IntentDefinitionSchema,
  l2normalize,
  meanVector,
} from './intents';

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
  it('embeds every example once, in one batch, with the passage prefix', async () => {
    const fake = createFakeEmbedder();
    const protos = await buildIntentPrototypes(BUILT_IN_INTENTS, fake.embed);
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toHaveLength(BUILT_IN_INTENTS.reduce((n, i) => n + i.examples.length, 0));
    expect(fake.calls[0]!.every((t) => t.startsWith('passage: '))).toBe(true);
    expect(protos.map((p) => p.id)).toEqual(BUILT_IN_INTENTS.map((i) => i.id));
    for (const p of protos) {
      const norm = Math.sqrt(p.vector.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1, 5);
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
  const protos = [
    { id: 'a', vector: vec(1, 0, 0) },
    { id: 'b', vector: vec(0, 1, 0) },
    { id: 'c', vector: vec(0, 0, 1), threshold: 0.3 },
  ];

  it('tags an intent when the best chunk reaches the threshold', () => {
    const chunks = [l2normalize(vec(0.9, 0.1, 0)), l2normalize(vec(0.2, 0.6, 0.8))];
    const out = classifyIntents(chunks, protos);
    expect(out.map((m) => m.id)).toEqual(['a', 'c']);
    expect(out[0]!.chunkOrd).toBe(0);
    expect(out[0]!.score).toBeGreaterThanOrEqual(DEFAULT_INTENT_THRESHOLD);
    expect(out[1]!.chunkOrd).toBe(1);
  });

  it('respects the configured threshold', () => {
    const chunks = [l2normalize(vec(0.7, 0.7, 0))];
    expect(classifyIntents(chunks, protos).map((m) => m.id)).toEqual([]);
    expect(classifyIntents(chunks, protos, { threshold: 0.7 }).map((m) => m.id)).toEqual([
      'a',
      'b',
    ]);
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
