import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Spinner } from '../primitives/spinner';
import type { FilterFacet } from './SearchSuggestion';

export type FilterBlankProps = Omit<ComponentProps<'button'>, 'value'> & {
  facet: FilterFacet;
  /** The blank's text when nothing is chosen: "anyone". */
  empty: string;
  /**
   * The chosen value: "Hot lead", or several as "<bdi>דנה לוי</bdi> + 1". User text inside should
   * be wrapped in `<bdi>` so it keeps its own direction. Unset means empty.
   */
  value?: ReactNode;
  /** Marketing samples: plain text, not a control. */
  readOnly?: boolean;
  /** The blank has no effect right now (matching with no text typed). */
  inactive?: boolean;
  /** Work started by this blank is running (loading the meaning model). */
  busy?: boolean;
};

/**
 * One filter inside the sentence: its value and the button that changes it. Empty is bold with a
 * dashed underline, set is an accent tint with a solid underline. Never a pill.
 */
export function FilterBlank({
  facet,
  empty,
  value,
  readOnly = false,
  inactive = false,
  busy = false,
  className,
  ...props
}: FilterBlankProps) {
  const set = value !== undefined && value !== '';
  const look = cn(
    'rounded-t-xs px-0.5 font-semibold underline underline-offset-4 decoration-dashed decoration-muted-foreground box-decoration-clone',
    set &&
      'bg-primary-subtle px-1.5 text-primary-subtle-foreground decoration-2 decoration-solid decoration-primary',
    !set && (inactive ? 'text-muted-foreground' : 'text-foreground'),
    className,
  );
  const text = (
    <>
      {busy ? <Spinner className="me-1 inline align-[-2px]" /> : null}
      {set ? value : empty}
    </>
  );
  if (readOnly) {
    return (
      <span data-component="FilterBlank" data-facet={facet} className={look}>
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-component="FilterBlank"
      data-facet={facet}
      aria-haspopup="dialog"
      className={cn(
        look,
        'cursor-pointer hover:decoration-foreground data-[state=open]:outline-2 data-[state=open]:outline-ring data-[state=open]:outline-offset-1 data-[state=open]:outline',
      )}
      {...props}
    >
      {text}
    </button>
  );
}
