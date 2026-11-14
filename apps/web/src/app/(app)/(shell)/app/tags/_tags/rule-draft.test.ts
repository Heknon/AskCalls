import { evaluateRules, type Rule } from '@askcalls/indexing';
import { describe, expect, it } from 'vitest';
import {
  bucketsFor,
  fromRule,
  newCondition,
  newDraft,
  type RuleDraft,
  type SummaryWords,
  summarize,
  toRule,
  validate,
} from './rule-draft';
import { checkGroups } from './synonyms';

const contacts = [
  { id: 'c1', name: 'Dana Levi', phones: ['+972525550134'], aliases: [] },
  { id: 'c2', name: 'Avi', phones: ['+972545550000', '+97235550199'], aliases: [] },
];
const known = { tagIds: new Set(['t1']), contactIds: new Set(['c1', 'c2']) };

const words: SummaryWords = {
  intent: (id) => `intent:${id}`,
  contact: ({ op, name }) => `${op}:${name ?? 'list'}`,
  duration: (op, n) => `${op}:${n}`,
  direction: (d) => `dir:${d}`,
  regex: 'pattern',
  tag: (name) => `tag ${name}`,
  star: 'star',
  tagName: (id) => (id === 't1' ? 'Billing' : null),
  contactName: (id) => contacts.find((c) => c.id === id)?.name ?? null,
};

function full(): RuleDraft {
  const d = newDraft('r1', 'Hot leads');
  d.match = 'any';
  d.conditions = [
    { key: 'c1', type: 'keyword', terms: ['מחיר', 'price quote'], match: 'all', fuzzy: true },
    { key: 'c2', type: 'intent', intentId: 'purchase_interest' },
    { key: 'c3', type: 'contact', op: 'not_in', contact: 'c2' },
    { key: 'c4', type: 'duration', op: 'atMost', minutes: 15 },
    { key: 'c5', type: 'direction', direction: 'out' },
    { key: 'c6', type: 'regex', pattern: '\\d{3}-\\d{4}', caseSensitive: true },
  ];
  d.actions = [
    { key: 'a1', type: 'add_tag', tagId: 't1' },
    { key: 'a2', type: 'star' },
  ];
  return d;
}

const strip = (d: RuleDraft) => ({
  ...d,
  conditions: d.conditions.map(({ key: _k, ...c }) => c),
  actions: d.actions.map(({ key: _k, ...a }) => a),
});

describe('rule drafts', () => {
  it('maps duration edges to buckets', () => {
    expect(bucketsFor('atLeast', 1)).toEqual([1, 2, 3, 4]);
    expect(bucketsFor('atLeast', 5)).toEqual([2, 3, 4]);
    expect(bucketsFor('atLeast', 60)).toEqual([4]);
    expect(bucketsFor('atMost', 1)).toEqual([0]);
    expect(bucketsFor('atMost', 15)).toEqual([0, 1, 2]);
  });

  it('round-trips every condition and action through the stored rule', () => {
    const draft = full();
    const rule = toRule(draft, contacts);
    expect(rule.conditions[2]).toEqual({
      type: 'contact',
      op: 'not_in',
      phones: ['+972545550000', '+97235550199'],
    });
    expect(rule.conditions[3]).toEqual({ type: 'duration', buckets: [0, 1, 2] });
    expect(strip(fromRule(rule, contacts, 'IL'))).toEqual(strip(draft));
  });

  it('reads the whole contact list when the condition has no numbers', () => {
    const rule: Rule = toRule(
      {
        ...newDraft('r2', ''),
        conditions: [newCondition('contact')],
        actions: [{ key: 'x', type: 'star' }],
      },
      contacts,
    );
    expect(rule.conditions[0]).toEqual({ type: 'contact', op: 'in' });
    expect(rule.name).toBeUndefined();
    expect(fromRule(rule, contacts, 'IL').conditions[0]).toMatchObject({ contact: 'all' });
  });

  it('flags rows without a value and invalid patterns', () => {
    const d = newDraft('r3', '');
    d.conditions.push({ key: 'x1', type: 'regex', pattern: '(a', caseSensitive: false });
    d.conditions.push(newCondition('intent'));
    d.conditions.push({ key: 'x3', type: 'contact', op: 'in', contact: 'deleted' });
    const problems = validate(d, known);
    expect([...problems.values()]).toEqual([
      'pickValue',
      'regexInvalid',
      'pickValue',
      'pickValue',
      'pickValue',
    ]);
    expect(validate(full(), known).size).toBe(0);
  });

  it('summarizes conditions and actions in one line', () => {
    expect(summarize(full(), words)).toBe(
      'מחיר, price quote + intent:purchase_interest + not_in:Avi + atMost:15 + dir:out + pattern → tag Billing, star',
    );
  });

  it('stores rules the engine evaluates as built', () => {
    const d = newDraft('r4', 'Invoices');
    d.conditions = [{ key: 'k', type: 'keyword', match: 'any', terms: ['invoice'], fuzzy: false }];
    d.actions = [{ key: 'a', type: 'add_tag', tagId: 't1' }];
    const rule = toRule(d, contacts);
    const facts = {
      keywordCounts: new Map([['invoice', 1]]),
      intentIds: [],
      phoneE164: null,
      contactPhones: new Set<string>(),
      durationBucket: 1 as const,
      direction: 'in' as const,
      texts: ['the invoice'],
    };
    expect(evaluateRules([rule], facts).tagIds).toEqual(['t1']);
    expect(evaluateRules([rule], { ...facts, keywordCounts: new Map() }).tagIds).toEqual([]);
  });
});

describe('synonym groups', () => {
  it('keeps single-word groups and flags spaces and repeated main terms', () => {
    const { problems, entries } = checkGroups([
      { key: 'a', canonical: 'iphone', variants: ['אייפון'] },
      { key: 'b', canonical: 'price', variants: ['price list'] },
      { key: 'c', canonical: 'IPhone', variants: [] },
      { key: 'd', canonical: '', variants: [] },
    ]);
    expect(entries).toEqual([{ canonical: 'iphone', variants: ['אייפון'] }]);
    expect([...problems]).toEqual([
      ['b', 'oneWord'],
      ['c', 'exists'],
    ]);
  });
});
