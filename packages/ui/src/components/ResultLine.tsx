'use client';

import { ChevronDown, X } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';

export type ResultLineProps = {
  /** Calls matching now. While a new page loads pass undefined: the last number stays. */
  total?: number;
  /** "18 calls" in the UI language. */
  formatTotal: (n: number) => string;
  /** Fuzzy and synonym variants also searched, each removable. */
  variants?: { term: string; onExclude: () => void }[];
  labels: { alsoMatched: string; exclude: (term: string) => string; sort: string };
  sort: {
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
  };
  /** A line of work in progress: "Loading the meaning model (34 MB, once)". */
  status?: ReactNode;
};

/** How many calls match, which word variants were also searched, and the sort. */
export function ResultLine({
  total,
  formatTotal,
  variants = [],
  labels,
  sort,
  status,
}: ResultLineProps) {
  const last = useRef(total);
  if (total !== undefined) last.current = total;
  const shown = total ?? last.current;
  const current = sort.options.find((o) => o.value === sort.value);
  return (
    <div
      data-component="ResultLine"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground text-sm"
    >
      <strong aria-live="polite" className="tabular font-semibold text-foreground">
        {shown === undefined ? '…' : formatTotal(shown)}
      </strong>
      {variants.length > 0 ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span>{labels.alsoMatched}</span>
          {variants.map((v) => (
            <span
              key={v.term}
              className="inline-flex h-6 items-center gap-0.5 rounded-full border border-input border-dashed ps-2 pe-1 text-foreground text-xs"
            >
              <bdi>{v.term}</bdi>
              <button
                type="button"
                aria-label={labels.exclude(v.term)}
                onClick={v.onExclude}
                className="inline-flex size-4 cursor-pointer items-center justify-center rounded-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </span>
      ) : null}
      {status ? <span className="inline-flex items-center gap-1.5">{status}</span> : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`${labels.sort}: ${current?.label ?? ''}`}
          className="ms-auto inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 font-medium text-foreground hover:bg-accent"
        >
          {current?.label}
          <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuRadioGroup value={sort.value} onValueChange={sort.onChange}>
            {sort.options.map((o) => (
              <DropdownMenuRadioItem key={o.value} value={o.value}>
                {o.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
