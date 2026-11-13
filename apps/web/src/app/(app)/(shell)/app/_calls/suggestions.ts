import type { ScoredSuggestion } from '@askcalls/ui/components/SearchBox';
import type { FilterFacet, SearchSuggestionData } from '@askcalls/ui/components/SearchSuggestion';
import { matchScore } from '@askcalls/ui/lib/match';
import type { TagColour } from '@askcalls/ui/lib/tag-colour';
import type { DatePreset, DirectionFilter, Filters } from './filters';

const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const PREFIX = /^[ובכלמשה]/;

/** Lower case, no niqqud, final letters as their regular forms: how indexing compares words. */
export function normalizeForMatch(s: string): string {
  return s
    .toLocaleLowerCase()
    .replace(/[֑-ׇ]/g, '')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c]!);
}

/** Word-start match, also after one Hebrew prefix letter ("בדנה" finds "דנה"). */
export function suggestionScore(label: string, query: string): 0 | 1 | undefined {
  const l = normalizeForMatch(label);
  const q = normalizeForMatch(query.trim());
  if (!q) return undefined;
  const direct = matchScore(l, q);
  if (direct !== undefined) return direct;
  if (q.length > 2 && PREFIX.test(q)) {
    const bare = matchScore(l, q.slice(1));
    if (bare !== undefined) return 1;
  }
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && digits.length === q.replace(/[\s+()-]/g, '').length) {
    return l.replace(/\D/g, '').includes(digits) ? 1 : undefined;
  }
  return undefined;
}

export interface SuggestionCatalog {
  /** Contact-list entries (value: contact id) and numbers seen in calls (value: E.164). */
  contacts: { value: string; label: string; numeric?: boolean; kind: 'contact' | 'number' }[];
  tags: { id: string; name: string; colour: TagColour }[];
  intents: { id: string; label: string }[];
  /** Calls whose metadata is decrypted: the contact's name or number, when and how long. */
  calls: { id: string; contact: string; numeric?: boolean; meta: string }[];
  dates: { preset: DatePreset; label: string }[];
  directions: { value: Exclude<DirectionFilter, 'all'>; label: string }[];
  /** Words that open a blank's picker ("tag", "תגית"). */
  groups: { facet: FilterFacet; word: string; label: string; size: number }[];
}

export interface SuggestionActions {
  contact: (value: string, kind: 'contact' | 'number') => void;
  tag: (id: string) => void;
  intent: (id: string) => void;
  starred: () => void;
  date: (preset: DatePreset) => void;
  direction: (value: Exclude<DirectionFilter, 'all'>) => void;
  group: (facet: FilterFacet) => void;
  call: (id: string) => void;
  words: () => void;
}

export interface SuggestionLabels {
  kinds: { contact: string; tag: string; intent: string; date: string; direction: string };
  contact: string;
  only: (kind: string) => string;
  add: (kind: string) => string;
  chosen: (kind: string) => string;
  group: (kind: string, n: number) => string;
  callWith: (contact: string) => string;
  words: (q: string) => string;
  wordsMeta: string;
  starred: string;
  onlyThese: string;
}

/** Suggestions for the typed text, built on the device from the decrypted catalogs. */
export function buildSuggestions(
  query: string,
  catalog: SuggestionCatalog,
  filters: Filters,
  labels: SuggestionLabels,
  act: SuggestionActions,
): {
  values: ScoredSuggestion[];
  records: SearchSuggestionData[];
  wordSearch?: SearchSuggestionData;
} {
  const q = query.trim();
  if (!q) return { values: [], records: [] };
  const values: ScoredSuggestion[] = [];
  const push = (s: Omit<ScoredSuggestion, 'score'>, score: 0 | 1 | undefined) => {
    if (score !== undefined) values.push({ ...s, score });
  };
  const state = (chosen: boolean, others: number, kind: string) =>
    chosen ? labels.chosen(kind) : others > 0 ? labels.add(kind) : labels.only(kind);

  for (const c of catalog.contacts) {
    const chosen =
      c.kind === 'contact' ? filters.contacts.includes(c.value) : filters.numbers.includes(c.value);
    const others = filters.contacts.length + filters.numbers.length;
    push(
      {
        id: `contact:${c.value}`,
        kind: 'contact',
        label: c.label,
        numeric: c.numeric,
        meta: chosen || others > 0 ? state(chosen, others, labels.kinds.contact) : labels.contact,
        onSelect: () => act.contact(c.value, c.kind),
      },
      suggestionScore(c.label, q),
    );
  }
  for (const t of catalog.tags) {
    push(
      {
        id: `tag:${t.id}`,
        kind: 'tag',
        label: t.name,
        colour: t.colour,
        meta: state(filters.tags.includes(t.id), filters.tags.length, labels.kinds.tag),
        onSelect: () => act.tag(t.id),
      },
      suggestionScore(t.name, q),
    );
  }
  for (const i of catalog.intents) {
    push(
      {
        id: `intent:${i.id}`,
        kind: 'intent',
        label: i.label,
        meta: state(filters.intents.includes(i.id), filters.intents.length, labels.kinds.intent),
        onSelect: () => act.intent(i.id),
      },
      suggestionScore(i.label, q),
    );
  }
  push(
    {
      id: 'starred',
      kind: 'starred',
      label: labels.starred,
      meta: labels.onlyThese,
      onSelect: act.starred,
    },
    filters.starred ? undefined : suggestionScore(labels.starred, q),
  );
  for (const d of catalog.dates) {
    push(
      {
        id: `date:${d.preset}`,
        kind: 'date-preset',
        label: d.label,
        meta: labels.kinds.date,
        onSelect: () => act.date(d.preset),
      },
      suggestionScore(d.label, q),
    );
  }
  for (const d of catalog.directions) {
    push(
      {
        id: `dir:${d.value}`,
        kind: 'direction',
        label: d.label,
        meta: labels.kinds.direction,
        onSelect: () => act.direction(d.value),
      },
      suggestionScore(d.label, q),
    );
  }
  for (const g of catalog.groups) {
    const score = suggestionScore(g.word, q) ?? suggestionScore(g.label, q);
    push(
      {
        id: `group:${g.facet}`,
        kind: 'group',
        facet: g.facet,
        label: g.label,
        meta: labels.group(
          labels.kinds[g.facet as keyof SuggestionLabels['kinds']] ?? g.label,
          g.size,
        ),
        onSelect: () => act.group(g.facet),
      },
      g.size > 0 ? score : undefined,
    );
  }

  const records = catalog.calls
    .filter((c) => suggestionScore(c.contact, q) !== undefined)
    .map(
      (c): SearchSuggestionData => ({
        id: `call:${c.id}`,
        kind: 'call',
        label: labels.callWith(c.contact),
        meta: c.meta,
        onSelect: () => act.call(c.id),
      }),
    );

  return {
    values,
    records,
    wordSearch: {
      id: 'words',
      kind: 'words',
      label: labels.words(q),
      meta: labels.wordsMeta,
      onSelect: act.words,
    },
  };
}
