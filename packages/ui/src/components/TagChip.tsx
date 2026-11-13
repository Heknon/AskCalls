'use client';

import { Check, Lightbulb, WandSparkles, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { type TagColour, tagChipClass, tagDotClass } from '../lib/tag-colour';
import { Badge } from '../primitives/badge';
import { Tooltip } from '../primitives/tooltip';

export type TagChipProps = {
  name: string;
  colour: TagColour;
  /**
   * Who attached it. `rule`: an auto-tag rule (wand icon, rule name in a tooltip). `intent`:
   * derived from the call's content, outlined, can be dismissed but not renamed.
   */
  source?: 'manual' | 'rule' | 'intent';
  /** Tooltip for `source="rule"`: "Added by rule “Price questions”". */
  ruleLabel?: string;
  /** Edit mode: a remove button named by `removeLabel` ("Remove tag Hot lead"). */
  onRemove?: () => void;
  removeLabel?: string;
  /** Shown as a chosen option in a tag picker. */
  selected?: boolean;
  className?: string;
};

/** One tag attached to a call. Not for filters (FilterBlank) or statuses (Badge). */
export function TagChip({
  name,
  colour,
  source = 'manual',
  ruleLabel,
  onRemove,
  removeLabel,
  selected = false,
  className,
}: TagChipProps) {
  const chip = (
    <Badge
      data-component="TagChip"
      data-source={source}
      className={cn(
        'h-5.5 max-w-full gap-1.25 rounded-sm px-2',
        source === 'intent'
          ? 'border border-input bg-transparent text-foreground'
          : tagChipClass[colour],
        className,
      )}
    >
      {selected ? (
        <Check aria-hidden />
      ) : source === 'rule' ? (
        <WandSparkles aria-hidden />
      ) : source === 'intent' ? (
        <Lightbulb aria-hidden />
      ) : (
        <span className={cn('size-1.75 shrink-0 rounded-full', tagDotClass[colour])} aria-hidden />
      )}
      <span dir="auto" className="truncate">
        {name}
      </span>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="-me-1 inline-flex size-4 cursor-pointer items-center justify-center rounded-xs opacity-80 hover:opacity-100 [&_svg]:size-3"
        >
          <X aria-hidden />
        </button>
      ) : null}
    </Badge>
  );
  if (source === 'rule' && ruleLabel) {
    return (
      <Tooltip content={ruleLabel}>
        <span tabIndex={onRemove ? undefined : 0} className="inline-flex max-w-full rounded-sm">
          {chip}
        </span>
      </Tooltip>
    );
  }
  return chip;
}
