'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../primitives/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../primitives/select';

export type RuleSelect = {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  /** Accessible name: "Condition", "Comparison", "Action". */
  label: string;
};

export function RuleSelectField({ select }: { select: RuleSelect }) {
  return (
    <Select value={select.value} onValueChange={select.onChange}>
      <SelectTrigger aria-label={select.label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {select.options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type RuleConditionProps = {
  /** What is tested: Keyword, Intent, Duration, Contact, Direction. */
  field: RuleSelect;
  /** How: "contains any of", "is", "is longer than". */
  operator: RuleSelect;
  /** The value: a `TermInput`, a `TagChip`, an input. */
  children: ReactNode;
  onRemove: () => void;
  removeLabel: string;
};

export const ruleRowClass =
  'grid grid-cols-1 items-center gap-2 rounded-md border border-border bg-background p-2.5 md:grid-cols-[10rem_9rem_minmax(0,1fr)_auto]';

/** One condition: "Keyword contains any of …". */
export function RuleCondition({
  field,
  operator,
  children,
  onRemove,
  removeLabel,
}: RuleConditionProps) {
  return (
    <div data-component="RuleCondition" className={ruleRowClass}>
      <RuleSelectField select={field} />
      <RuleSelectField select={operator} />
      <div className="min-w-0">{children}</div>
      <RemoveButton onRemove={onRemove} label={removeLabel} />
    </div>
  );
}

export function RemoveButton({ onRemove, label }: { onRemove: () => void; label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={onRemove}
      className="justify-self-end"
    >
      <X className="size-4" aria-hidden />
    </Button>
  );
}
