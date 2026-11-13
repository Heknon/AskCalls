'use client';

import { Search, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { SearchSuggestion, type SearchSuggestionData } from './SearchSuggestion';

const MAX_SUGGESTIONS = 6;

export type ScoredSuggestion = SearchSuggestionData & {
  /** 0: the value starts with the text, 1: one of its words does (`matchScore`). */
  score?: 0 | 1;
};

export type SearchBoxProps = {
  value: string;
  /** Called on every keystroke; the screen debounces the search itself (250 ms). */
  onChange: (value: string) => void;
  /** Enter with nothing highlighted: run the keyword search now. */
  onSubmit?: (value: string) => void;
  placeholder: string;
  labels: { search: string; clear: string };
  /** Filter values and pickers matching the text, from the decrypted local catalogs. */
  suggestions?: ScoredSuggestion[];
  /** Calls found by the text. */
  records?: SearchSuggestionData[];
  /** "Words: מחיר · Search the transcripts", offered last when anything else is suggested. */
  wordSearch?: SearchSuggestionData;
  /** `/` focuses the box when focus is not in a text field. */
  slashShortcut?: boolean;
  /** Moves into the list on ↓ when no suggestions are open. */
  onArrowDownOut?: () => void;
  className?: string;
};

/** Values first, then up to 2 calls (4 when no value matches); identifiers put calls first. */
export function orderSuggestions(
  query: string,
  values: ScoredSuggestion[],
  records: SearchSuggestionData[],
  wordSearch?: SearchSuggestionData,
) {
  const q = query.trim();
  if (!q) return [];
  const sorted = [...values].sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
  const calls = records.slice(0, sorted.length ? 2 : 4);
  const looksLikeId = /\d/.test(q) || q.length >= 6;
  const list = looksLikeId ? [...calls, ...sorted] : [...sorted, ...calls];
  if (list.length === 0) return [];
  return wordSearch
    ? [...list.slice(0, MAX_SUGGESTIONS - 1), wordSearch]
    : list.slice(0, MAX_SUGGESTIONS);
}

function isTextField(el: Element | null) {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable
  );
}

/** The one text input for finding calls; suggests filter values and calls as you type. */
export function SearchBox({
  value,
  onChange,
  onSubmit,
  placeholder,
  labels,
  suggestions = [],
  records = [],
  wordSearch,
  slashShortcut = true,
  onArrowDownOut,
  className,
}: SearchBoxProps) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const items = useMemo(
    () => orderSuggestions(value, suggestions, records, wordSearch),
    [value, suggestions, records, wordSearch],
  );
  const open = focused && !dismissed && items.length > 0;

  useEffect(() => {
    if (!slashShortcut) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextField(document.activeElement)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slashShortcut]);

  const choose = (s: SearchSuggestionData) => {
    s.onSelect();
    if (s.kind !== 'words') onChange('');
    setHighlight(-1);
    setDismissed(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open) {
        if (e.key === 'ArrowDown' && onArrowDownOut) {
          e.preventDefault();
          onArrowDownOut();
        }
        return;
      }
      e.preventDefault();
      const n = items.length;
      setHighlight((h) => (e.key === 'ArrowDown' ? (h + 1) % n : h <= 0 ? n - 1 : h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const s = open ? items[highlight] : undefined;
      if (s) choose(s);
      else {
        setDismissed(true);
        onSubmit?.(value);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setDismissed(true);
        setHighlight(-1);
      } else if (value) {
        e.preventDefault();
        onChange('');
      }
    }
  };

  return (
    <search
      data-component="SearchBox"
      className={cn('relative block w-full md:max-w-2xl', className)}
    >
      <Search
        className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        dir="auto"
        aria-label={labels.search}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && highlight >= 0 ? `${listId}-${highlight}` : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlight(-1);
          setDismissed(false);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setDismissed(false);
          setHighlight(-1);
        }}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-xl border border-input bg-card ps-10 pe-10 text-md text-foreground text-ui-start shadow-xs placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:outline-offset-1"
      />
      {value ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={labels.clear}
          className="absolute end-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
        >
          <X className="size-4" aria-hidden />
        </Button>
      ) : null}
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label={labels.search}
          onMouseDown={(e) => e.preventDefault()}
          className="absolute start-0 top-full z-30 mt-1.5 flex w-full animate-fade-in flex-col rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg md:w-md"
        >
          {items.map((s, i) => (
            <SearchSuggestion
              key={s.id}
              id={`${listId}-${i}`}
              suggestion={s}
              query={value}
              highlighted={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => choose(s)}
            />
          ))}
        </div>
      ) : null}
    </search>
  );
}
