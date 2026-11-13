import { createApiClient } from '@askcalls/api-contract';
import { describe, expect, it } from 'vitest';
import { countOlderThan, lastDeletedDay } from './count';

describe('retention count', () => {
  const today = new Date('2026-11-13T09:00:00Z');

  it('matches the nightly rule day < today − days', () => {
    // 2026-11-13 is day 20770; with 30 days, day 20740 stays and 20739 goes.
    expect(lastDeletedDay(today, 30)).toBe(20739);
  });

  it('pages through every call up to that day', async () => {
    const seen: string[] = [];
    const api = createApiClient({
      fetch: async (input) => {
        const q = new URL(String(input), 'http://x').searchParams;
        seen.push(`${q.get('day_to')}:${q.get('cursor') ?? ''}`);
        const item = {
          id: 'c',
          day: 1,
          durationBucket: 0,
          wrappedDek: '',
          metaCt: '',
          tagToks: [],
          hasRecording: false,
          starred: null,
        };
        const first = !q.get('cursor');
        return Response.json({
          items: first ? Array(100).fill(item) : [item, item],
          nextCursor: first ? 'next' : null,
        });
      },
    });
    expect(await countOlderThan(api, today, 30)).toBe(102);
    expect(seen).toEqual(['20739:', '20739:next']);
  });
});
