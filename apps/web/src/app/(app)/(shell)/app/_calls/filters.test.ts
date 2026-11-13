import { describe, expect, it } from 'vitest';
import {
  dateRange,
  EMPTY_FILTERS,
  type Filters,
  filterByDirection,
  filtersToParams,
  isFiltered,
  parseFilters,
} from './filters';

const roundTrip = (f: Filters) => parseFilters(new URLSearchParams(filtersToParams(f).toString()));

describe('filters in the URL', () => {
  it('is empty for the plain list', () => {
    expect(filtersToParams(EMPTY_FILTERS).toString()).toBe('');
    expect(parseFilters(new URLSearchParams())).toEqual(EMPTY_FILTERS);
  });

  it('round-trips every blank', () => {
    const f: Filters = {
      ...EMPTY_FILTERS,
      starred: true,
      contacts: ['c1', 'c2'],
      tags: ['t1'],
      intents: ['purchase_interest'],
      date: '30d',
      direction: 'in',
      match: 'words',
      sort: 'oldest',
    };
    expect(roundTrip(f)).toEqual(f);
    expect(
      roundTrip({ ...EMPTY_FILTERS, date: { from: '2026-01-02', to: '2026-02-03' } }).date,
    ).toEqual({ from: '2026-01-02', to: '2026-02-03' });
  });

  it('never writes numbers picked without a contact', () => {
    const p = filtersToParams({ ...EMPTY_FILTERS, numbers: ['+972525550134'] });
    expect(p.toString()).toBe('');
    expect(isFiltered({ ...EMPTY_FILTERS, numbers: ['+972525550134'] })).toBe(true);
  });

  it('drops malformed values', () => {
    const f = parseFilters(
      new URLSearchParams('dir=sideways&date=2026-1-1~x&sort=random&tag=ok,<script>&match=yes'),
    );
    expect(f).toEqual({ ...EMPTY_FILTERS, tags: ['ok'] });
  });

  it('treats sort as an order, not a filter', () => {
    expect(isFiltered({ ...EMPTY_FILTERS, sort: 'longest' })).toBe(false);
    expect(isFiltered({ ...EMPTY_FILTERS, direction: 'out' })).toBe(true);
  });
});

describe('date presets', () => {
  const now = new Date(2026, 10, 13, 15, 30);
  it('covers whole local days, today included', () => {
    expect(dateRange('today', now)).toEqual({
      from: new Date(2026, 10, 13),
      to: new Date(2026, 10, 13),
    });
    expect(dateRange('7d', now).from).toEqual(new Date(2026, 10, 7));
    expect(dateRange('30d', now).from).toEqual(new Date(2026, 9, 15));
    expect(dateRange('year', now).from).toEqual(new Date(2026, 0, 1));
    expect(dateRange(null, now)).toEqual({});
  });
});

describe('direction on the device', () => {
  const items = [
    { id: 'a', meta: { direction: 'in' as const } },
    { id: 'b', meta: { direction: 'out' as const } },
    { id: 'c', meta: { direction: 'unknown' as const } },
    { id: 'd', meta: undefined },
  ];
  it('keeps only decrypted calls in the chosen direction', () => {
    const by = (f: 'all' | 'in' | 'out') =>
      filterByDirection(items, (i) => i.meta, f).map((i) => i.id);
    expect(by('all')).toEqual(['a', 'b', 'c', 'd']);
    expect(by('in')).toEqual(['a']);
    expect(by('out')).toEqual(['b']);
  });
});
