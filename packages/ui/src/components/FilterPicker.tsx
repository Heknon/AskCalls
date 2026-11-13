'use client';

import { Check, Search } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useState } from 'react';
import type { DateRange, Locale } from 'react-day-picker';
import { cn } from '../lib/cn';
import { type TagColour, tagDotClass } from '../lib/tag-colour';
import { useIsPhone } from '../lib/use-media-query';
import { Button } from '../primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '../primitives/sheet';
import { Toggle } from '../primitives/toggle';

// The date grid loads when a date blank first opens, not with every page that has filters.
const Calendar = lazy(() =>
  import('../primitives/calendar').then((m) => ({ default: m.Calendar })),
);

const SEARCHABLE_OVER = 8;

export type FilterPickerOption = {
  value: string;
  label: string;
  /** Tags: the colour dot. */
  colour?: TagColour;
  /** Phone numbers without a name: shown as an LTR island. */
  numeric?: boolean;
};

export type FilterPickerLabels = {
  clear: string;
  /** Placeholder and name of the search field: "Search 23 contacts". */
  search: string;
  noMatch: (query: string) => string;
  /** The catalog is empty: "No tags yet. Tags you add appear here." */
  empty: string;
  chosen: (n: number) => string;
  pickMany: string;
  /** "Show 18 calls"; without a total the button reads `done`. */
  show: (total: number) => string;
  done: string;
  tapOne: string;
};

export type FilterPickerProps = {
  /** "Which tag?". */
  title: string;
  options: FilterPickerOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Several values (contacts, tags, intents); otherwise one tap chooses and closes. */
  multiple?: boolean;
  /** Ordered values (date presets) keep their order instead of chosen-first. */
  ordered?: boolean;
  /** Defaults to on over 8 options, and when opened with `initialQuery`. */
  searchable?: boolean;
  /** Opened from a group suggestion: the picker starts searched. */
  initialQuery?: string;
  /** Calls matching now, from the server, for the "Show 18 calls" button. */
  total?: number;
  /** The date blank's custom range, under the presets. */
  range?: {
    selected?: DateRange;
    onSelect: (range: DateRange | undefined) => void;
    locale?: Locale;
  };
  labels: FilterPickerLabels;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The `FilterBlank` that opens it. */
  children: ReactNode;
};

function PickerBody({
  title,
  options,
  value,
  onChange,
  multiple = false,
  ordered = false,
  searchable,
  initialQuery = '',
  total,
  range,
  labels,
  close,
  titleAs: Title,
}: Omit<FilterPickerProps, 'children' | 'open' | 'onOpenChange'> & {
  close: () => void;
  titleAs: typeof SheetTitle | 'h2';
}) {
  const [query, setQuery] = useState(initialQuery);
  // Fixed while open, so a chip never moves under the next tap.
  const [order] = useState(() =>
    ordered
      ? options.map((o) => o.value)
      : [...options]
          .sort((a, b) => Number(value.includes(b.value)) - Number(value.includes(a.value)))
          .map((o) => o.value),
  );
  const showSearch = searchable ?? (options.length > SEARCHABLE_OVER || initialQuery !== '');
  const q = query.trim().toLocaleLowerCase();
  const shown = options
    .filter((o) => !q || o.label.toLocaleLowerCase().includes(q))
    .sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value));

  const pick = (v: string) => {
    if (!multiple) {
      onChange(value.includes(v) ? [] : [v]);
      close();
      return;
    }
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  return (
    <div className="flex max-h-[inherit] min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <Title className="font-semibold text-base">{title}</Title>
        {value.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="ms-auto cursor-pointer text-muted-foreground text-sm hover:text-foreground"
          >
            {labels.clear}
          </button>
        ) : null}
      </div>
      {showSearch ? (
        <div className="relative px-4 pb-2">
          <Search
            className="pointer-events-none absolute start-7 top-3 size-4 text-muted-foreground"
            aria-hidden
          />
          <input
            type="text"
            dir="auto"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.search}
            aria-label={labels.search}
            className="h-10 w-full rounded-lg border border-input bg-card px-9 text-md text-ui-start placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:outline-offset-1 md:text-base"
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4">
        {options.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-sm">{labels.empty}</p>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-muted-foreground text-sm">
            {labels.noMatch(query.trim())}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {shown.map((o) => {
              const on = value.includes(o.value);
              return (
                <Toggle
                  key={o.value}
                  variant="chip"
                  pressed={on}
                  onPressedChange={() => pick(o.value)}
                  className="max-w-full"
                >
                  {on ? (
                    <Check className="size-3.5" aria-hidden />
                  ) : o.colour ? (
                    <span
                      className={cn('size-2 rounded-full', tagDotClass[o.colour])}
                      aria-hidden
                    />
                  ) : null}
                  <bdi
                    dir={o.numeric ? 'ltr' : 'auto'}
                    className={cn('truncate', o.numeric && 'tabular')}
                  >
                    {o.label}
                  </bdi>
                </Toggle>
              );
            })}
          </div>
        )}
        {range ? (
          <Suspense fallback={null}>
            <Calendar
              mode="range"
              selected={range.selected}
              onSelect={range.onSelect}
              locale={range.locale}
              className="mt-3"
            />
          </Suspense>
        ) : null}
      </div>
      {multiple ? (
        <div className="flex items-center gap-3 border-border border-t px-4 py-3">
          <span className="flex-1 text-muted-foreground text-sm">
            {value.length ? labels.chosen(value.length) : labels.pickMany}
          </span>
          <Button variant="primary" size="sm" onClick={close}>
            {total === undefined ? labels.done : labels.show(total)}
          </Button>
        </div>
      ) : (
        <p className="px-4 pb-3 text-muted-foreground text-xs">{labels.tapOne}</p>
      )}
    </div>
  );
}

/**
 * The short list of values for one filter blank: a popover anchored to the blank on desktop, a
 * bottom sheet on phones (no automatic keyboard). No per-option counts.
 */
export function FilterPicker({ open, onOpenChange, children, ...body }: FilterPickerProps) {
  const isPhone = useIsPhone();
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = (o: boolean) => {
    setInnerOpen(o);
    onOpenChange?.(o);
  };
  const close = () => setOpen(false);

  if (isPhone) {
    return (
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetTrigger asChild>{children}</SheetTrigger>
        <SheetContent
          side="bottom"
          data-component="FilterPicker"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetDescription className="sr-only">{body.title}</SheetDescription>
          <PickerBody {...body} close={close} titleAs={SheetTitle} />
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        data-component="FilterPicker"
        role="dialog"
        aria-label={body.title}
        className="flex max-h-(--radix-popover-content-available-height) w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl p-0 shadow-lg"
      >
        <PickerBody {...body} close={close} titleAs="h2" />
      </PopoverContent>
    </Popover>
  );
}
