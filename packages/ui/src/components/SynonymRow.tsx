'use client';

import { X } from 'lucide-react';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { TermInput, type TermInputProps } from './TermInput';

export type SynonymRowProps = {
  /** The form searches map to: "מחיר". */
  canonical: string;
  onCanonicalChange: (term: string) => void;
  /** The other forms: "price", "עלות", "cost". */
  forms: TermInputProps;
  onRemove: () => void;
  labels: { canonical: string; remove: string };
};

/** One synonym group: several forms that search as one term. */
export function SynonymRow({
  canonical,
  onCanonicalChange,
  forms,
  onRemove,
  labels,
}: SynonymRowProps) {
  return (
    <div
      data-component="SynonymRow"
      className="grid grid-cols-1 items-start gap-2 border-border border-b px-4 py-3 last:border-b-0 md:grid-cols-[12rem_minmax(0,1fr)_auto]"
    >
      <Input
        dir="auto"
        aria-label={labels.canonical}
        value={canonical}
        onChange={(e) => onCanonicalChange(e.target.value)}
        className="font-medium"
      />
      <TermInput {...forms} />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={labels.remove}
        onClick={onRemove}
        className="justify-self-end"
      >
        <X className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
