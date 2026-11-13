'use client';

import { type ReactNode, useId } from 'react';
import { Badge } from '../primitives/badge';
import { Checkbox } from '../primitives/checkbox';
import { RadioGroupItem } from '../primitives/radio-group';

export type ChoiceCardProps = {
  /** The `RadioGroup` value this card stands for. */
  value: string;
  /**
   * Choices that combine (sign-in methods): a checkbox instead of a radio, outside a
   * `RadioGroup`. Same look, same revealed details.
   */
  checkbox?: { checked: boolean; onCheckedChange: (checked: boolean) => void };
  title: string;
  description: ReactNode;
  /** Shown under the description when chosen (fields for this choice). */
  details?: ReactNode;
  /** Not offered in this version; `badge` says why ("Planned"). */
  disabled?: boolean;
  badge?: string;
};

/**
 * A large option with a title and description: a radio inside a `RadioGroup`, or with
 * `checkbox` one of several choices that can be on together.
 */
export function ChoiceCard({
  value,
  checkbox,
  title,
  description,
  details,
  disabled,
  badge,
}: ChoiceCardProps) {
  const id = useId();
  return (
    <div
      data-component="ChoiceCard"
      className="group/choice relative flex cursor-pointer gap-3 rounded-lg border border-border bg-card px-4 py-3.5 has-disabled:cursor-not-allowed has-disabled:bg-muted has-data-[state=checked]:border-primary has-data-[state=checked]:ring-1 has-data-[state=checked]:ring-primary"
    >
      {checkbox ? (
        <Checkbox
          id={id}
          value={value}
          checked={checkbox.checked}
          onCheckedChange={(v) => checkbox.onCheckedChange(v === true)}
          disabled={disabled}
          aria-describedby={`${id}-d`}
          className="mt-0.75"
        />
      ) : (
        <RadioGroupItem
          id={id}
          value={value}
          disabled={disabled}
          aria-describedby={`${id}-d`}
          className="mt-0.75"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label
          htmlFor={id}
          className="flex cursor-[inherit] items-center gap-2 font-semibold after:absolute after:inset-0 after:content-['']"
        >
          {title}
          {badge ? <Badge>{badge}</Badge> : null}
        </label>
        <span id={`${id}-d`} className="text-muted-foreground text-sm">
          {description}
        </span>
        {details ? (
          <div className="relative z-10 mt-2 hidden cursor-auto group-has-data-[state=checked]/choice:block">
            {details}
          </div>
        ) : null}
      </div>
    </div>
  );
}
