import type { CallDirection, CallMeta } from '@askcalls/domain';

export type DatePreset = 'today' | '7d' | '30d' | 'year';
export const DATE_PRESETS: readonly DatePreset[] = ['today', '7d', '30d', 'year'];

/** A custom range as calendar days, `YYYY-MM-DD`, both inclusive. */
export type DateRangeValue = { from: string; to: string };
export type DateFilter = DatePreset | DateRangeValue | null;

export type DirectionFilter = 'all' | 'in' | 'out';
export type MatchBy = 'words' | 'meaning';
export type SortOrder = 'newest' | 'oldest' | 'longest' | 'best';

/**
 * Everything the filter sentence sets. Contacts are catalog ids (random, never derived from a
 * name); numbers picked without a contact stay in memory and never reach the URL.
 */
export interface Filters {
  starred: boolean;
  contacts: string[];
  numbers: string[];
  tags: string[];
  intents: string[];
  date: DateFilter;
  direction: DirectionFilter;
  match: MatchBy;
  sort: SortOrder;
}

export const EMPTY_FILTERS: Filters = {
  starred: false,
  contacts: [],
  numbers: [],
  tags: [],
  intents: [],
  date: null,
  direction: 'all',
  match: 'meaning',
  sort: 'newest',
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[\w:-]{1,64}$/;
const SORTS: readonly SortOrder[] = ['newest', 'oldest', 'longest', 'best'];

const list = (v: string | null) => (v ? v.split(',').filter((x) => ID.test(x)) : []);

/** Reads the filters from the URL. Unknown or malformed values fall back to the default. */
export function parseFilters(params: URLSearchParams): Filters {
  const date = params.get('date');
  const range = date?.split('~');
  const direction = params.get('dir');
  const sort = params.get('sort') as SortOrder | null;
  return {
    ...EMPTY_FILTERS,
    starred: params.get('starred') === '1',
    contacts: list(params.get('contact')),
    tags: list(params.get('tag')),
    intents: list(params.get('intent')),
    date: DATE_PRESETS.includes(date as DatePreset)
      ? (date as DatePreset)
      : range?.length === 2 && DAY.test(range[0]!) && DAY.test(range[1]!)
        ? { from: range[0]!, to: range[1]! }
        : null,
    direction: direction === 'in' || direction === 'out' ? direction : 'all',
    match: params.get('match') === 'words' ? 'words' : 'meaning',
    sort: sort && SORTS.includes(sort) ? sort : 'newest',
  };
}

/** The URL form of the filters: opaque ids and presets only, never text, names or numbers. */
export function filtersToParams(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.starred) p.set('starred', '1');
  if (f.contacts.length) p.set('contact', f.contacts.join(','));
  if (f.tags.length) p.set('tag', f.tags.join(','));
  if (f.intents.length) p.set('intent', f.intents.join(','));
  if (f.date) p.set('date', typeof f.date === 'string' ? f.date : `${f.date.from}~${f.date.to}`);
  if (f.direction !== 'all') p.set('dir', f.direction);
  if (f.match === 'words') p.set('match', 'words');
  if (f.sort !== 'newest') p.set('sort', f.sort);
  return p;
}

/** True when any blank of the sentence is set (sort is not a filter). */
export function isFiltered(f: Filters): boolean {
  return (
    f.starred ||
    f.contacts.length > 0 ||
    f.numbers.length > 0 ||
    f.tags.length > 0 ||
    f.intents.length > 0 ||
    f.date !== null ||
    f.direction !== 'all' ||
    f.match === 'words'
  );
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const toDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function fromDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** The local-day range a date filter covers. */
export function dateRange(date: DateFilter, now: Date = new Date()): { from?: Date; to?: Date } {
  if (!date) return {};
  const today = startOfDay(now);
  const back = (days: number) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() - days);
  switch (date) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: back(6), to: today };
    case '30d':
      return { from: back(29), to: today };
    case 'year':
      return { from: new Date(today.getFullYear(), 0, 1), to: today };
    default:
      return { from: fromDay(date.from), to: fromDay(date.to) };
  }
}

/** Direction is in the encrypted metadata only, so it filters on the device after decrypting. */
export function matchesDirection(direction: CallDirection, filter: DirectionFilter): boolean {
  return filter === 'all' || direction === filter;
}

export function filterByDirection<T>(
  items: readonly T[],
  metaOf: (item: T) => Pick<CallMeta, 'direction'> | undefined,
  filter: DirectionFilter,
): T[] {
  if (filter === 'all') return [...items];
  return items.filter((item) => {
    const meta = metaOf(item);
    return meta !== undefined && matchesDirection(meta.direction, filter);
  });
}
