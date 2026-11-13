import type { ApiClient } from '@askcalls/api-contract';
import { listCalls } from '@askcalls/api-contract/routes/calls';
import { dayFromDate } from '@askcalls/domain';

/** The newest `day` the nightly run deletes with this policy (`day < today − days`). */
export const lastDeletedDay = (today: Date, days: number) => dayFromDate(today) - days - 1;

/** How many calls the next nightly run would delete. Ids and days only. */
export async function countOlderThan(api: ApiClient, today: Date, days: number): Promise<number> {
  const dayTo = lastDeletedDay(today, days);
  if (dayTo < 0) return 0;
  let n = 0;
  let cursor: string | null = null;
  do {
    const page: { items: unknown[]; nextCursor: string | null } = await api.request(listCalls, {
      query: { limit: 100, day_to: dayTo, ...(cursor && { cursor }) },
    });
    n += page.items.length;
    cursor = page.nextCursor;
  } while (cursor);
  return n;
}
