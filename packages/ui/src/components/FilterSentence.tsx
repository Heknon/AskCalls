import { Fragment, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export type FilterSentenceItem = {
  key: string;
  /** The words before the blank in this language ("with", "tagged"); omitted where folded in. */
  before?: string;
  /** A `FilterBlank`, usually wrapped in its `FilterPicker`. */
  blank: ReactNode;
};

export type FilterSentenceProps = {
  /** "Showing". */
  lead: string;
  items: FilterSentenceItem[];
  /** Shows the Clear link; pass it only while any blank is set. */
  onClear?: () => void;
  clearLabel?: string;
  className?: string;
};

/**
 * Every filter at once as an editable sentence: "Showing [all calls] · with [anyone] · tagged
 * [any tag] …". Each language orders its own words; Hebrew folds some prepositions into values.
 */
export function FilterSentence({
  lead,
  items,
  onClear,
  clearLabel,
  className,
}: FilterSentenceProps) {
  return (
    <p
      data-component="FilterSentence"
      className={cn('text-muted-foreground text-sm leading-7.5 md:leading-8', className)}
    >
      {lead}{' '}
      {items.map((item, i) => (
        <Fragment key={item.key}>
          {i > 0 ? (
            <span aria-hidden className="mx-1">
              ·
            </span>
          ) : null}
          <span className="whitespace-nowrap">
            {item.before ? `${item.before} ` : null}
            {item.blank}
          </span>
        </Fragment>
      ))}
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="ms-3 cursor-pointer text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {clearLabel}
        </button>
      ) : null}
    </p>
  );
}
