'use client';

import { formatDate } from '@askcalls/ui/lib/dates';
import { useFormatter, useLocale, useNow } from 'next-intl';
import { useCallback } from 'react';
import { intlLocale } from '../../../../../../i18n/locales';

/** Dates in Settings rows: "3 Oct 2026" and "2 hours ago". */
export function useDates() {
  const format = useFormatter();
  const locale = intlLocale(useLocale());
  const now = useNow({ updateInterval: 60_000 });
  const date = useCallback((d: Date) => formatDate(d, locale), [locale]);
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
