import { DomainError } from '@askcalls/domain';
import { describe, expect, it } from 'vitest';
import { extractKeywords } from './keywords';
import { evaluateRules, parseRules, type RuleFacts, type RuleInput, RuleSchema } from './rules';
import { checkRegex, compileSafeRegex, REGEX_WINDOW, regexWindows } from './safe-regex';
import { buildSynonymLookup } from './synonyms';

const TEXT = [
  'שלום, אני מתקשר לגבי המחיר של המזגן.',
  'I want to cancel my subscription, the service is terrible.',
  'אפשר לקבוע טכנאי ליום שלישי? מספר הזמנה 48213.',
];

function facts(overrides: Partial<RuleFacts> = {}): RuleFacts {
  return {
    keywordCounts: extractKeywords(TEXT.join('\n')).counts,
    intentIds: ['price_question'],
    phoneE164: '+972541234567',
    contactPhones: new Set(['+972541234567', '+97231234567']),
    durationBucket: 2,
    direction: 'in',
    texts: TEXT,
    ...overrides,
  };
}

function rule(
  input: Omit<RuleInput, 'id' | 'actions'> & Partial<Pick<RuleInput, 'id' | 'actions'>>,
) {
  return RuleSchema.parse({ id: 'r1', actions: [{ type: 'add_tag', tagId: 'tag-1' }], ...input });
}

const matches = (r: ReturnType<typeof rule>, f: RuleFacts = facts()) =>
  evaluateRules([r], f).matchedRuleIds.length === 1;

describe('rule schema', () => {
  it('applies defaults', () => {
    const r = rule({ conditions: [{ type: 'keyword', terms: ['מחיר'] }] });
    expect(r.enabled).toBe(true);
    expect(r.match).toBe('all');
    expect(r.conditions[0]).toEqual({
      type: 'keyword',
      terms: ['מחיר'],
      match: 'any',
      fuzzy: false,
    });
  });

  it('rejects malformed and unsafe rules with a content-free error', () => {
    expect(() => parseRules([{ id: 'x', conditions: [], actions: [{ type: 'star' }] }])).toThrow(
      DomainError,
    );
    expect(() =>
      parseRules([
        {
          id: 'x',
          conditions: [{ type: 'regex', pattern: '(a+)+$' }],
          actions: [{ type: 'star' }],
        },
      ]),
    ).toThrow(/Rules failed validation/);
    expect(() =>
      parseRules([
        { id: 'x', conditions: [{ type: 'duration', buckets: [7] }], actions: [{ type: 'star' }] },
      ]),
    ).toThrow(DomainError);
    expect(() => parseRules('nope')).toThrow(DomainError);
  });

  it('round-trips through JSON (rules are stored as encrypted JSON)', () => {
    const rules = parseRules([
      {
        id: 'vip',
        name: 'VIP price calls',
        match: 'all',
        conditions: [
          { type: 'contact', op: 'in' },
          { type: 'intent', intentId: 'price_question' },
          { type: 'regex', pattern: '\\d{5}', caseSensitive: true },
        ],
        actions: [{ type: 'add_tag', tagId: 'vip' }, { type: 'star' }],
      },
    ]);
    expect(parseRules(JSON.parse(JSON.stringify(rules)))).toEqual(rules);
  });
});

describe('conditions', () => {
  it('keyword any/all, with Hebrew prefixes and multi-word terms', () => {
    expect(matches(rule({ conditions: [{ type: 'keyword', terms: ['מחיר'] }] }))).toBe(true); // "המחיר"
    expect(matches(rule({ conditions: [{ type: 'keyword', terms: ['מזגן', 'xyz'] }] }))).toBe(true);
    expect(
      matches(rule({ conditions: [{ type: 'keyword', match: 'all', terms: ['מזגן', 'xyz'] }] })),
    ).toBe(false);
    expect(
      matches(
        rule({ conditions: [{ type: 'keyword', match: 'all', terms: ['cancel', 'טכנאי'] }] }),
      ),
    ).toBe(true);
    expect(
      matches(rule({ conditions: [{ type: 'keyword', terms: ['cancel subscription'] }] })),
    ).toBe(true);
    expect(matches(rule({ conditions: [{ type: 'keyword', terms: ['cancel order'] }] }))).toBe(
      false,
    );
  });

  it('keyword terms that are only stopwords are ignored, never matched', () => {
    expect(matches(rule({ conditions: [{ type: 'keyword', terms: ['אני'] }] }))).toBe(false);
    expect(
      matches(rule({ conditions: [{ type: 'keyword', match: 'all', terms: ['אני', 'מזגן'] }] })),
    ).toBe(true);
  });

  it('fuzzy keyword matching is opt-in', () => {
    expect(matches(rule({ conditions: [{ type: 'keyword', terms: ['subscriptoin'] }] }))).toBe(
      false,
    );
    expect(
      matches(rule({ conditions: [{ type: 'keyword', terms: ['subscriptoin'], fuzzy: true }] })),
    ).toBe(true);
  });

  it('keyword with synonyms', () => {
    const synonyms = buildSynonymLookup([{ canonical: 'ac', variants: ['מזגן', 'מיזוג'] }]);
    const f = facts({ keywordCounts: extractKeywords(TEXT.join('\n'), { synonyms }).counts });
    const r = rule({ conditions: [{ type: 'keyword', terms: ['מיזוג'] }] });
    expect(evaluateRules([r], f, { synonyms }).matchedRuleIds).toEqual(['r1']);
  });

  it('intent is', () => {
    expect(matches(rule({ conditions: [{ type: 'intent', intentId: 'price_question' }] }))).toBe(
      true,
    );
    expect(matches(rule({ conditions: [{ type: 'intent', intentId: 'legal' }] }))).toBe(false);
  });

  it('contact in / not in the contact list or an explicit list', () => {
    expect(matches(rule({ conditions: [{ type: 'contact', op: 'in' }] }))).toBe(true);
    expect(matches(rule({ conditions: [{ type: 'contact', op: 'not_in' }] }))).toBe(false);
    expect(
      matches(rule({ conditions: [{ type: 'contact', op: 'in', phones: ['054-123-4567'] }] })),
    ).toBe(true);
    expect(
      matches(rule({ conditions: [{ type: 'contact', op: 'in', phones: ['052-000-0000'] }] })),
    ).toBe(false);
    const unknown = facts({ phoneE164: null });
    expect(matches(rule({ conditions: [{ type: 'contact', op: 'in' }] }), unknown)).toBe(false);
    expect(matches(rule({ conditions: [{ type: 'contact', op: 'not_in' }] }), unknown)).toBe(true);
  });

  it('duration bucket and direction', () => {
    expect(matches(rule({ conditions: [{ type: 'duration', buckets: [2, 3] }] }))).toBe(true);
    expect(matches(rule({ conditions: [{ type: 'duration', buckets: [0] }] }))).toBe(false);
    expect(
      matches(
        rule({ conditions: [{ type: 'duration', buckets: [0] }] }),
        facts({ durationBucket: null }),
      ),
    ).toBe(false);
    expect(matches(rule({ conditions: [{ type: 'direction', direction: 'in' }] }))).toBe(true);
    expect(matches(rule({ conditions: [{ type: 'direction', direction: 'out' }] }))).toBe(false);
  });

  it('regex, case-insensitive by default', () => {
    expect(matches(rule({ conditions: [{ type: 'regex', pattern: 'הזמנה \\d{5}' }] }))).toBe(true);
    expect(matches(rule({ conditions: [{ type: 'regex', pattern: 'TERRIBLE' }] }))).toBe(true);
    expect(
      matches(rule({ conditions: [{ type: 'regex', pattern: 'TERRIBLE', caseSensitive: true }] })),
    ).toBe(false);
    expect(matches(rule({ conditions: [{ type: 'regex', pattern: '^שלום' }] }))).toBe(true);
  });
});

describe('evaluateRules', () => {
  it('combines conditions with all / any', () => {
    const conditions = [
      { type: 'intent' as const, intentId: 'price_question' },
      { type: 'direction' as const, direction: 'out' as const },
    ];
    expect(matches(rule({ match: 'all', conditions }))).toBe(false);
    expect(matches(rule({ match: 'any', conditions }))).toBe(true);
  });

  it('collects distinct sorted tag ids, maps star to __star, skips disabled rules', () => {
    const rules = parseRules([
      {
        id: 'a',
        conditions: [{ type: 'keyword', terms: ['מזגן'] }],
        actions: [{ type: 'add_tag', tagId: 'zeta' }, { type: 'star' }],
      },
      {
        id: 'b',
        conditions: [{ type: 'direction', direction: 'in' }],
        actions: [
          { type: 'add_tag', tagId: 'alpha' },
          { type: 'add_tag', tagId: 'zeta' },
        ],
      },
      {
        id: 'c',
        enabled: false,
        conditions: [{ type: 'direction', direction: 'in' }],
        actions: [{ type: 'add_tag', tagId: 'off' }],
      },
      {
        id: 'd',
        conditions: [{ type: 'direction', direction: 'out' }],
        actions: [{ type: 'add_tag', tagId: 'never' }],
      },
    ]);
    expect(evaluateRules(rules, facts())).toEqual({
      tagIds: ['__star', 'alpha', 'zeta'],
      matchedRuleIds: ['a', 'b'],
    });
    expect(evaluateRules([], facts())).toEqual({ tagIds: [], matchedRuleIds: [] });
  });
});

describe('safe regex', () => {
  it.each([
    'הזמנה \\d{5}',
    '\\b(cancel|refund)\\b',
    '(mr|mrs)?\\s*cohen',
    '^\\p{L}+$',
    '[a-z]+@[a-z]+',
    '(?<num>\\d{3})-\\d{4}',
    '(?:ab){2}',
    '.*price.*',
    'a+?b',
    '\\d{1,100}',
  ])('accepts %j', (p) => expect(checkRegex(p)).toEqual({ ok: true }));

  it.each<[string, string]>([
    ['(a+)+$', 'nested_quantifier'],
    ['(a|aa)*', 'nested_quantifier'],
    ['(\\w+\\s?)*$', 'nested_quantifier'],
    ['((ab)*)+', 'nested_quantifier'],
    ['(.*a){5,10}', 'nested_quantifier'],
    ['(a)\\1', 'backreference'],
    ['(?<x>a)\\k<x>', 'backreference'],
    ['(?=a)b', 'lookaround'],
    ['(?<!a)b', 'lookaround'],
    ['.*.*.*.*x', 'too_many_quantifiers'],
    ['a{1,1000}', 'repeat_too_large'],
    ['[', 'syntax'],
    ['', 'empty'],
    ['a'.repeat(201), 'too_long'],
  ])('rejects %j (%s)', (p, reason) => expect(checkRegex(p)).toEqual({ ok: false, reason }));

  it('runs on bounded windows and gives up after the time budget', () => {
    const long = `${'x'.repeat(2000)}needle`;
    expect(regexWindows(long).every((w) => w.length <= REGEX_WINDOW)).toBe(true);
    expect(compileSafeRegex('needle')!.test([long])).toBe(true);
    // A match straddling a window edge is still found thanks to the overlap.
    const edge = `${'y'.repeat(REGEX_WINDOW - 3)}needle`;
    expect(compileSafeRegex('needle')!.test([edge])).toBe(true);

    let clock = 0;
    const re = compileSafeRegex('zzz', { budgetMs: 10, now: () => (clock += 6) })!;
    expect(re.test(['a', 'b', 'c', 'zzz'])).toBe(false);
    expect(compileSafeRegex('(a+)+')).toBeNull();
  });

  it('a rejected pattern cannot hang evaluation', () => {
    const t0 = performance.now();
    const f = facts({ texts: [`${'a'.repeat(5000)}!`] });
    const r = { ...rule({ conditions: [{ type: 'direction', direction: 'in' }] }) };
    // Bypass the schema to simulate a tampered stored rule.
    r.conditions = [{ type: 'regex', pattern: '(a+)+$', caseSensitive: false }];
    expect(evaluateRules([r], f).matchedRuleIds).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
