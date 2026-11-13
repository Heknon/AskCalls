import { describe, expect, it } from 'vitest';
import { actorKind, applyFilters } from './filter';

const now = Date.parse('2026-11-13T12:00:00Z');
const hoursAgo = (h: number) => new Date(now - h * 3_600_000);
const items = [
  { id: 'a', at: hoursAgo(1), actor: 'session' },
  { id: 'b', at: hoursAgo(5), actor: 'token:t1' },
  { id: 'c', at: hoursAgo(30), actor: 'agent:d1' },
  { id: 'd', at: hoursAgo(24 * 40), actor: 'system' },
];

describe('audit filters', () => {
  it('names actor kinds', () => {
    expect(['session', 'system', 'token:x', 'agent:y'].map(actorKind)).toEqual([
      'session',
      'system',
      'token',
      'agent',
    ]);
  });

  it('filters by actor and period', () => {
    const ids = (r: { shown: { id: string }[] }) => r.shown.map((e) => e.id);
    expect(ids(applyFilters(items, { actor: 'any', period: 'all' }, now, true))).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(ids(applyFilters(items, { actor: 'token', period: 'all' }, now, true))).toEqual(['b']);
    expect(ids(applyFilters(items, { actor: 'any', period: 'day' }, now, true))).toEqual([
      'a',
      'b',
    ]);
  });

  it('stops offering more once the oldest loaded event is past the period', () => {
    expect(applyFilters(items, { actor: 'any', period: 'week' }, now, true).canLoadMore).toBe(
      false,
    );
    expect(applyFilters(items.slice(0, 3), { actor: 'any', period: 'week' }, now, true)).toEqual(
      expect.objectContaining({ canLoadMore: true }),
    );
    expect(applyFilters(items, { actor: 'any', period: 'all' }, now, false).canLoadMore).toBe(
      false,
    );
  });
});
