'use client';

import { Search, SlidersHorizontal } from 'lucide-react';
import { type ReactNode, type RefObject, useEffect, useState } from 'react';

export type FoldedFilterSummaryProps = {
  /** "“מחיר” · Purchase interest · the last 30 days", or "All calls"; user text in `<bdi>`. */
  summary: ReactNode;
  total?: number;
  /** "Show search and filters". */
  label: string;
  /** Scroll back to the search block and focus the box. */
  onShow: () => void;
};

/**
 * True once `ref` has scrolled out of view above the top. Screens pass the search block and
 * show `FoldedFilterSummary` while it returns true.
 */
export function useFolded(ref: RefObject<HTMLElement | null>) {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setFolded(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return folded;
}

/** Phones only: one line pinned to the top that says what's filtered and brings the block back. */
export function FoldedFilterSummary({ summary, total, label, onShow }: FoldedFilterSummaryProps) {
  return (
    <button
      type="button"
      data-component="FoldedFilterSummary"
      onClick={onShow}
      className="fixed inset-x-0 top-0 z-20 flex w-full cursor-pointer items-center gap-2 border-border border-b bg-background/95 px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 text-foreground text-sm shadow-sm backdrop-blur-sm md:hidden"
    >
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-start">
        <span className="sr-only">{label}: </span>
        {summary}
      </span>
      {total !== undefined ? <span className="tabular text-muted-foreground">{total}</span> : null}
      <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
