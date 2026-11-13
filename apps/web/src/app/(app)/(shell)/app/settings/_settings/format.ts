'use client';

import { useFormatter, useNow } from 'next-intl';
import { useCallback } from 'react';

/** Dates in Settings rows: "3 Oct 2026" and "2 hours ago". */
export function useDates() {
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const date = useCallback(
    (d: Date) => format.dateTime(d, { day: 'numeric', month: 'short', year: 'numeric' }),
    [format],
  );
  const when = useCallback((d: Date) => format.relativeTime(d, now), [format, now]);
  return { date, when };
}

/** "1.2" from milliseconds, in the UI locale. */
export function useSeconds() {
  const format = useFormatter();
  return useCallback(
    (ms: number) =>
      format.number(ms / 1000, { maximumFractionDigits: 1, minimumFractionDigits: 1 }),
    [format],
  );
}
