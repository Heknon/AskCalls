import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS } from './filters';
import { buildSuggestions, suggestionScore } from './suggestions';

describe('suggestion matching', () => {
  it('matches word starts, case-insensitively', () => {
    expect(suggestionScore('Hot lead', 'hot')).toBe(0);
    expect(suggestionScore('Hot lead', 'lea')).toBe(1);
    expect(suggestionScore('Hot lead', 'ead')).toBeUndefined();
  });

  it('normalizes Hebrew final letters and one prefix letter', () => {
    expect(suggestionScore('דנה לוי', 'דנ')).toBe(0);
    expect(suggestionScore('מחירון', 'מחירונ')).toBe(0);
    expect(suggestionScore('דנה לוי', 'ודנה')).toBe(1);
  });

  it('finds numbers by their digits in any grouping', () => {
    expect(suggestionScore('+972 52-555-0134', '0134')).toBe(1);
    expect(suggestionScore('+972 52-555-0134', '0135')).toBeUndefined();
  });
});

describe('building suggestions', () => {
  const noop = () => {};
  const act = {
    contact: noop,
    tag: noop,
    intent: noop,
    starred: noop,
    date: noop,
    direction: noop,
    group: noop,
    call: noop,
    words: noop,
  };
  const labels = {
    kinds: {
      contact: 'Contact',
      tag: 'Tag',
      intent: 'Intent',
      date: 'Date',
      direction: 'Direction',
    },
    contact: 'Contact · show only this',
    only: (k: string) => `${k} · show only this`,
    add: (k: string) => `${k} · add to the filter`,
    chosen: (k: string) => `${k} · chosen, tap to remove`,
    group: (k: string, n: number) => `${k} · see all ${n}`,
    callWith: (c: string) => `Call with ${c}`,
    words: (q: string) => `Words: ${q}`,
    wordsMeta: 'Search the transcripts',
    starred: 'Starred calls',
    onlyThese: 'show only these',
  };
  const catalog = {
    contacts: [{ value: 'c1', label: 'Dana Levi', kind: 'contact' as const }],
    tags: [
      { id: 't1', name: 'Hot lead', colour: 'rose' as const },
      { id: 't2', name: 'Hold', colour: 'blue' as const },
    ],
    intents: [],
    calls: [{ id: 'k1', contact: 'Dana Levi', meta: 'Today, 14:32 · 8 min' }],
    dates: [],
    directions: [],
    groups: [{ facet: 'tag' as const, word: 'tag', label: 'Tags', size: 2 }],
  };

  it('says what a tag does in the current filter', () => {
    const none = buildSuggestions('ho', catalog, EMPTY_FILTERS, labels, act);
    expect(none.values.map((v) => v.meta)).toEqual([
      'Tag · show only this',
      'Tag · show only this',
    ]);
    const one = buildSuggestions('ho', catalog, { ...EMPTY_FILTERS, tags: ['t1'] }, labels, act);
    expect(one.values.map((v) => v.meta)).toEqual([
      'Tag · chosen, tap to remove',
      'Tag · add to the filter',
    ]);
  });

  it('offers the contact, their calls, a group and the word search', () => {
    const s = buildSuggestions('da', catalog, EMPTY_FILTERS, labels, act);
    expect(s.values.map((v) => v.label)).toEqual(['Dana Levi']);
    expect(s.records.map((r) => r.label)).toEqual(['Call with Dana Levi']);
    expect(s.wordSearch?.label).toBe('Words: da');
    expect(buildSuggestions('tag', catalog, EMPTY_FILTERS, labels, act).values[0]).toMatchObject({
      kind: 'group',
      meta: 'Tag · see all 2',
    });
    expect(buildSuggestions('  ', catalog, EMPTY_FILTERS, labels, act).values).toEqual([]);
  });
});
