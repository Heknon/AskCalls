'use client';

import { X } from 'lucide-react';
import { useState } from 'react';
import { Label } from '../primitives/label';
import { Switch } from '../primitives/switch';

export type TermInputProps = {
  terms: string[];
  onChange: (terms: string[]) => void;
  /** Names the field ("Keywords"); also the placeholder. */
  label: string;
  /** "Remove מחיר". */
  removeLabel: (term: string) => string;
  /** Keyword conditions: match spelling variants too. */
  fuzzy?: { checked: boolean; onChange: (v: boolean) => void; label: string };
};

/** A list of words typed as chips: Enter or comma adds one, Backspace on empty removes the last. */
export function TermInput({ terms, onChange, label, removeLabel, fuzzy }: TermInputProps) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (t && !terms.includes(t)) onChange([...terms, t]);
    setDraft('');
  };
  return (
    <div
      data-component="TermInput"
      className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1 focus-within:border-ring focus-within:outline-2 focus-within:outline-ring focus-within:outline-offset-1"
    >
      {terms.map((t) => (
        <span
          key={t}
          className="inline-flex h-6 items-center gap-1 rounded-sm bg-muted ps-2 pe-1 text-sm"
        >
          <bdi>{t}</bdi>
          <button
            type="button"
            aria-label={removeLabel(t)}
            onClick={() => onChange(terms.filter((x) => x !== t))}
            className="inline-flex size-4 cursor-pointer items-center justify-center rounded-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        dir="auto"
        value={draft}
        aria-label={label}
        placeholder={terms.length ? undefined : label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && draft === '' && terms.length) {
            onChange(terms.slice(0, -1));
          }
        }}
        className="h-7 min-w-20 flex-1 bg-transparent text-md outline-none placeholder:text-subtle-foreground focus-visible:outline-none md:text-sm"
      />
      {fuzzy ? (
        <span className="ms-auto inline-flex items-center gap-1.5 whitespace-nowrap text-muted-foreground text-xs">
          <Switch
            size="sm"
            checked={fuzzy.checked}
            onCheckedChange={fuzzy.onChange}
            aria-label={fuzzy.label}
          />
          <Label className="font-normal text-muted-foreground text-xs" aria-hidden>
            {fuzzy.label}
          </Label>
        </span>
      ) : null}
    </div>
  );
}
