'use client';

import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type WindowList = {
  /** First and one-past-last rendered index. */
  start: number;
  end: number;
  /** Space above and below the rendered rows, for the spacer items. */
  before: number;
  after: number;
  scrollToIndex: (index: number) => void;
};

/**
 * Renders only the rows near the viewport of a page-scrolled list. Row heights are measured
 * after render (tags and snippets make rows grow); unmeasured rows use `estimate`. The list
 * element holds a spacer before and after the rows, so `children` between them are the rows.
 */
export function useWindowList(
  listRef: RefObject<HTMLElement | null>,
  count: number,
  estimate: number,
  overscan = 6,
): WindowList {
  const heights = useRef<number[]>([]);
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 20) });
  const [, setVersion] = useState(0);

  const offsetOf = useCallback(
    (index: number) => {
      let y = 0;
      for (let i = 0; i < index; i++) y += heights.current[i] ?? estimate;
      return y;
    },
    [estimate],
  );

  const update = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const viewTop = -top;
    const viewBottom = viewTop + window.innerHeight;
    let y = 0;
    let start = 0;
    while (start < count && y + (heights.current[start] ?? estimate) < viewTop) {
      y += heights.current[start] ?? estimate;
      start++;
    }
    let end = start;
    while (end < count && y < viewBottom) {
      y += heights.current[end] ?? estimate;
      end++;
    }
    const next = { start: Math.max(0, start - overscan), end: Math.min(count, end + overscan) };
    setRange((r) => (r.start === next.start && r.end === next.end ? r : next));
  }, [listRef, count, estimate, overscan]);

  useEffect(() => {
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  // Measure the rendered rows: the list's children between the two spacers.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const rows = Array.from(el.children).slice(1, -1) as HTMLElement[];
      let moved = false;
      rows.forEach((row, i) => {
        const h = row.getBoundingClientRect().height;
        const index = range.start + i;
        if (h > 0 && Math.abs((heights.current[index] ?? estimate) - h) > 0.5) {
          heights.current[index] = h;
          moved = true;
        }
      });
      if (moved) setVersion((v) => v + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    for (const row of Array.from(el.children).slice(1, -1)) observer.observe(row);
    return () => observer.disconnect();
  });

  const scrollToIndex = useCallback(
    (index: number) => {
      const el = listRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY + offsetOf(index);
      const h = heights.current[index] ?? estimate;
      const margin = 72;
      if (top - margin < window.scrollY) window.scrollTo({ top: top - margin });
      else if (top + h > window.scrollY + window.innerHeight - margin) {
        window.scrollTo({ top: top + h - window.innerHeight + margin });
      }
      update();
    },
    [listRef, offsetOf, estimate, update],
  );

  const start = Math.min(range.start, count);
  const end = Math.min(Math.max(range.end, Math.min(count, 20)), count);
  const total = offsetOf(count);
  const before = offsetOf(start);
  return { start, end, before, after: Math.max(0, total - offsetOf(end)), scrollToIndex };
}
