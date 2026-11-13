import { DomainError } from '@askcalls/domain';
import { describe, expect, it } from 'vitest';
import { damerauLevenshtein, expandTerm, MAX_VARIANTS_PER_TERM, maxEditDistance } from './fuzzy';
import { normalizeWord } from './normalize';
import { prepareQuery } from './query';
import { buildSynonymLookup } from './synonyms';
import {
  compactDeltas,
  createVocabulary,
  deserializeVocabulary,
  mergeVocabulary,
  needsCompaction,
  negateVocabulary,
  newForms,
  serializeVocabulary,
} from './vocabulary';

describe('damerauLevenshtein', () => {
  it.each<[string, string, number]>([
    ['', '', 0],
    ['abc', '', 3],
    ['kitten', 'sitting', 3],
    ['price', 'prcie', 1],
    ['ca', 'ac', 1],
    ['מחיר', 'מחירר', 1],
    ['מחיר', 'מיחר', 1],
    ['שלומ', 'שלמ', 1],
    ['abcdef', 'abcdef', 0],
    ['😀a', 'a😀', 1],
  ])('%j vs %j = %d', (a, b, d) => {
    expect(damerauLevenshtein(a, b)).toBe(d);
    expect(damerauLevenshtein(b, a)).toBe(d);
  });
  it('stops early above max', () => {
    expect(damerauLevenshtein('kitten', 'sitting', 1)).toBe(2);
    expect(damerauLevenshtein('a', 'abcdef', 2)).toBe(3);
  });
});

describe('maxEditDistance', () => {
  it.each<[string, number]>([
    ['abc', 0],
    ['abcd', 1],
    ['abcdef', 1],
    ['abcdefg', 2],
    ['צה״ל', 0],
    ['מחירון', 1],
    ['חשבונית', 2],
  ])('%s → %d', (w, d) => expect(maxEditDistance(w)).toBe(d));
});

describe('expandTerm', () => {
  const vocab = createVocabulary([
    ['מחיר', 10],
    ['מחירים', 4],
    ['מחירון', 7],
    ['מיחר', 1],
    ['מחר', 30],
    ['חשבונית', 5],
    ['חשבוניות', 3],
    ['חשבונות', 2],
    ['price', 3],
    ['prices', 9],
    ['pricing', 2],
    ['prize', 1],
  ]);

  it('matches distance 1 for 4–6 letters', () => {
    expect(expandTerm('מחיר', vocab).map((v) => [v.form, v.kind, v.distance])).toEqual([
      ['מחיר', 'exact', 0],
      ['מחר', 'fuzzy', 1],
      ['מיחר', 'fuzzy', 1],
    ]);
  });

  it('matches distance 2 for 7+ letters', () => {
    expect(expandTerm('חשבונית', vocab).map((v) => v.form)).toEqual([
      'חשבונית',
      'חשבוניות',
      'חשבונות',
    ]);
  });

  it('ranks by distance, then frequency', () => {
    expect(expandTerm('prise', vocab).map((v) => v.form)).toEqual(['price', 'prize']);
    // Both at distance 1: the more frequent first.
    expect(expandTerm('pricse', vocab).map((v) => v.form)).toEqual(['prices', 'price']);
  });

  it('does no fuzzy matching under 4 letters', () => {
    expect(expandTerm('מחר', vocab).map((v) => v.form)).toEqual(['מחר']);
  });

  it('prefix matching: explicit `*` at any length, or the setting at 3+ letters', () => {
    expect(expandTerm('pri', vocab, { explicitPrefix: true }).map((v) => v.form)).toEqual([
      'prices',
      'price',
      'pricing',
      'prize',
    ]);
    expect(expandTerm('pri', vocab).map((v) => v.form)).toEqual([]);
    expect(expandTerm('pri', vocab, { includePrefixes: true }).map((v) => v.form)).toHaveLength(4);
    expect(expandTerm('pr', vocab, { includePrefixes: true })).toEqual([]);
  });

  it('caps at 32 variants', () => {
    const big = createVocabulary(
      Array.from({ length: 100 }, (_, i) => [`test${i}`, i + 1] as const),
    );
    const out = expandTerm('test', big, { explicitPrefix: true });
    expect(out).toHaveLength(MAX_VARIANTS_PER_TERM);
    expect(out[0]!.form).toBe('test99');
  });

  it('can disable fuzzy matching', () => {
    expect(expandTerm('מחיר', vocab, { fuzzy: false }).map((v) => v.form)).toEqual(['מחיר']);
  });

  it('scans a 50,000-form vocabulary quickly', () => {
    const big = createVocabulary(
      Array.from({ length: 50_000 }, (_, i) => [`form${i.toString(36)}`, 1] as const),
    );
    const t0 = performance.now();
    expandTerm('formabcd', big);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('prepareQuery', () => {
  const vocabulary = createVocabulary([
    ['דני', 5],
    ['דנה', 2],
    ['מחירון', 7],
    ['מחירים', 3],
    ['iphone', 4],
    ['iphones', 1],
    ['ההזמנה', 2],
    ['הזמנה', 6],
  ]);

  it('builds one group per term, with own forms first, then variants', () => {
    const q = prepareQuery('לדני מחיר*', { vocabulary });
    expect(q.keywordGroups).toEqual([
      ['לדני', 'דני'],
      ['מחיר', 'חיר', 'מחירון', 'מחירים'],
    ]);
    expect(q.terms[1]!.prefix).toBe(true);
    expect(q.alsoMatched).toEqual(['מחירון', 'מחירים']);
    // Typo variants start at 4 letters (דני is 3, so it got none above).
    expect(prepareQuery('דנהה', { vocabulary }).alsoMatched).toEqual(['דנה']);
  });

  it('fixes typos against the vocabulary', () => {
    const q = prepareQuery('iphnoe', { vocabulary });
    expect(q.keywordGroups).toEqual([['iphnoe', 'iphone']]);
    expect(q.alsoMatched).toEqual(['iphone']);
  });

  it('drops stopwords and duplicates', () => {
    const q = prepareQuery('אני רוצה את ההזמנה ההזמנה', { vocabulary });
    expect(q.ignored).toEqual(['אני', 'את']);
    expect(q.terms.map((t) => t.term)).toEqual(['רוצה', 'ההזמנה']);
    expect(q.keywordGroups[1]).toEqual(['ההזמנה', 'הזמנה']);
  });

  it('works without a vocabulary', () => {
    const q = prepareQuery('וכשהגענו');
    expect(q.keywordGroups).toEqual([['וכשהגענו', 'כשהגענו', 'שהגענו', 'הגענו', 'גענו']]);
    expect(q.alsoMatched).toEqual([]);
  });

  it('applies synonyms like indexing does', () => {
    const synonyms = buildSynonymLookup([{ canonical: 'iphone', variants: ['אייפון'] }]);
    expect(prepareQuery('אייפון', { synonyms }).keywordGroups).toEqual([['אייפונ', 'iphone']]);
  });

  it('include-prefixes setting', () => {
    const q = prepareQuery('הזמ', { vocabulary, includePrefixes: true });
    expect(q.keywordGroups).toEqual([['הזמ', 'הזמנה']]);
  });

  it('caps each group at 32 forms', () => {
    const big = createVocabulary(Array.from({ length: 100 }, (_, i) => [`test${i}`, 1] as const));
    expect(prepareQuery('test*', { vocabulary: big }).keywordGroups[0]).toHaveLength(32);
  });

  it('redacts the embedding text', () => {
    const q = prepareQuery('השיחה עם דני על 054-1234567', { redaction: { names: ['דני'] } });
    expect(q.embedText).toBe('query: השיחה עם [NAME] על [PHONE]');
    expect(prepareQuery('price*').embedText).toBe('query: price');
  });

  it('splits hyphenated words into separate terms', () => {
    expect(prepareQuery('תל-אביב').keywordGroups).toEqual([['תל'], ['אביב']]);
  });
});

describe('vocabulary', () => {
  it('merges deltas and removes forms that reach zero', () => {
    const v = createVocabulary([['a1', 2]]);
    mergeVocabulary(
      v,
      new Map([
        ['a1', 1],
        ['b2', 3],
      ]),
    );
    expect([...v]).toEqual([
      ['a1', 3],
      ['b2', 3],
    ]);
    mergeVocabulary(v, negateVocabulary(new Map([['b2', 3]])));
    expect([...v]).toEqual([['a1', 3]]);
  });

  it('reports new forms', () => {
    expect(newForms(createVocabulary([['שלומ', 1]]), ['שלומ', 'עולמ'])).toEqual(['עולמ']);
  });

  it('serializes deterministically and round-trips', () => {
    const a = createVocabulary([
      ['שלומ', 2],
      ['abc', 1],
      ['מחיר', 5],
    ]);
    const b = createVocabulary([
      ['מחיר', 5],
      ['abc', 1],
      ['שלומ', 2],
    ]);
    expect(serializeVocabulary(a)).toEqual(serializeVocabulary(b));
    expect(deserializeVocabulary(serializeVocabulary(a))).toEqual(a);
    const delta = new Map([['x1', -2]]);
    expect(deserializeVocabulary(serializeVocabulary(delta))).toEqual(delta);
  });

  it('rejects garbage', () => {
    expect(() => deserializeVocabulary(new Uint8Array([0xff, 0xfe]))).toThrow(DomainError);
    expect(() => deserializeVocabulary(new TextEncoder().encode('{"v":2,"forms":[]}'))).toThrow(
      DomainError,
    );
    expect(() =>
      deserializeVocabulary(new TextEncoder().encode('{"v":1,"forms":[["a",1.5]]}')),
    ).toThrow(DomainError);
  });

  it('signals compaction above 50 deltas and compacts them', () => {
    expect(needsCompaction(50)).toBe(false);
    expect(needsCompaction(51)).toBe(true);
    const deltas = Array.from(
      { length: 60 },
      (_, i) =>
        new Map([
          ['common', 1],
          [`w${i % 3}`, 1],
        ]),
    );
    deltas.push(new Map([['w0', -20]]));
    expect(compactDeltas(deltas)).toEqual(
      new Map([
        ['common', 60],
        ['w1', 20],
        ['w2', 20],
      ]),
    );
  });

  it('indexes normalized forms that prepareQuery finds', () => {
    const v = createVocabulary([[normalizeWord('שלום'), 1]]);
    expect(prepareQuery('שלוםם', { vocabulary: v }).alsoMatched).toEqual(['שלומ']);
  });
});
