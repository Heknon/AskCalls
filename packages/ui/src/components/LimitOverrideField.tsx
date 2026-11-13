'use client';

import { X } from 'lucide-react';
import { useId } from 'react';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { Label } from '../primitives/label';

export type LimitOverrideFieldProps = {
  /** "Calls stored". */
  label: string;
  /** "min", "GB", "calls". */
  unit: string;
  /** The account's own value as typed; empty uses the instance limit. */
  value: string;
  onChange: (value: string) => void;
  /** The instance limit in the field's unit, shown as the placeholder ("500"). */
  instance: string;
  /** "Instance limit: 500". */
  instanceLabel: string;
  invalid?: boolean;
  disabled?: boolean;
  labels: { clear: string };
};

/**
 * One limit an admin can set for a single account. Empty falls back to the instance limit,
 * which the field shows as its placeholder and caption.
 */
export function LimitOverrideField({
  label,
  unit,
  value,
  onChange,
  instance,
  instanceLabel,
  invalid = false,
  disabled = false,
  labels,
}: LimitOverrideFieldProps) {
  const id = useId();
  const hint = `${id}-hint`;
  return (
    <div
      data-component="LimitOverrideField"
      data-overridden={value !== '' || undefined}
      className="flex flex-col gap-1.5 py-3"
    >
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          className="tabular max-w-40"
          value={value}
          placeholder={instance}
          aria-invalid={invalid || undefined}
          aria-describedby={hint}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-muted-foreground text-sm">{unit}</span>
        {value !== '' ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`${labels.clear}: ${label}`}
            disabled={disabled}
            onClick={() => onChange('')}
          >
            <X className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>
      <p id={hint} className="text-muted-foreground text-sm">
        {instanceLabel}
      </p>
    </div>
  );
}
