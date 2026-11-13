'use client';

import { CircleAlert } from 'lucide-react';
import { type ClipboardEvent, type KeyboardEvent, useId, useRef } from 'react';
import { cn } from '../lib/cn';

export type CodeGroupInputProps = {
  /** One string per group, as typed so far. */
  values: string[];
  onChange: (values: string[]) => void;
  groupLength: number;
  /** One visible label per group: "Group 3", "Group 6". */
  labels: string[];
  /** Digits only (a short link code); letters and digits otherwise. */
  numeric?: boolean;
  error?: string;
  className?: string;
};

const clean = (s: string, numeric: boolean) =>
  (numeric ? s.replace(/\D/g, '') : s.replace(/[^0-9a-z]/gi, '')).toUpperCase();

/**
 * Typing back a code: two recovery groups to confirm, the full code to unlock, or a short link
 * code. One input per group; typing a full group moves on, pasting fills every group.
 */
export function CodeGroupInput({
  values,
  onChange,
  groupLength,
  labels,
  numeric = false,
  error,
  className,
}: CodeGroupInputProps) {
  const id = useId();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const count = labels.length;

  const fillFrom = (start: number, raw: string) => {
    const chars = clean(raw, numeric);
    const next = [...values];
    let pos = 0;
    let i = start;
    for (; i < count && pos < chars.length; i++) {
      next[i] = chars.slice(pos, pos + groupLength);
      pos += groupLength;
    }
    onChange(next);
    const last = Math.min(i, count) - 1;
    const target = next[last]?.length === groupLength && last + 1 < count ? last + 1 : last;
    refs.current[Math.max(target, start)]?.focus();
  };

  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget;
    if (e.key === 'Backspace' && el.value === '' && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && el.selectionStart === 0 && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && el.selectionStart === el.value.length && i + 1 < count) {
      refs.current[i + 1]?.focus();
    }
  };

  return (
    <div data-component="CodeGroupInput" className={cn('flex flex-col gap-1.5', className)}>
      <div
        dir="ltr"
        className={cn('grid gap-3', count > 2 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}
      >
        {labels.map((label, i) => (
          <div key={label} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-${i}`} className="font-medium text-sm" dir="auto">
              {label}
            </label>
            <input
              ref={(el) => {
                refs.current[i] = el;
              }}
              id={`${id}-${i}`}
              value={values[i] ?? ''}
              inputMode={numeric ? 'numeric' : 'text'}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(e) => {
                const v = clean(e.target.value, numeric);
                if (v.length > groupLength) fillFrom(i, v);
                else {
                  const next = [...values];
                  next[i] = v;
                  onChange(next);
                  if (v.length === groupLength && i + 1 < count) refs.current[i + 1]?.focus();
                }
              }}
              onPaste={(e: ClipboardEvent<HTMLInputElement>) => {
                e.preventDefault();
                fillFrom(i, e.clipboardData.getData('text'));
              }}
              onKeyDown={onKeyDown(i)}
              className="h-12 w-full min-w-0 rounded-md border border-input bg-card text-center font-mono text-lg uppercase tracking-[0.2em] focus-visible:border-ring focus-visible:outline-offset-1 aria-invalid:border-destructive"
            />
          </div>
        ))}
      </div>
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-destructive text-sm">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
