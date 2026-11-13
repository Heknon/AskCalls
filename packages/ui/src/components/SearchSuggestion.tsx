import {
  Calendar,
  Lightbulb,
  Phone,
  PhoneIncoming,
  ScanSearch,
  Search,
  Star,
  Tag,
  User,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { matchRange } from '../lib/match';
import { type TagColour, tagDotClass } from '../lib/tag-colour';
import { Kbd } from './Kbd';

/** What a suggestion means; its look follows from this. */
export type SuggestionKind =
  | 'contact'
  | 'tag'
  | 'intent'
  | 'starred'
  | 'direction'
  | 'date-preset'
  /** Opens that blank's picker. */
  | 'group'
  /** Opens the call. */
  | 'call'
  /** Runs the keyword search. */
  | 'words';

export type FilterFacet = 'starred' | 'contact' | 'tag' | 'intent' | 'date' | 'direction' | 'match';

export type SearchSuggestionData = {
  id: string;
  kind: SuggestionKind;
  /** The whole label; the part matching `query` is drawn bold with an accent underline. */
  label: string;
  /** "Contact · show only this", "Today, 14:32 · 8 min". */
  meta: string;
  /** For `group`: which blank's picker it opens. */
  facet?: FilterFacet;
  /** For `tag`: the tag's colour dot. */
  colour?: TagColour;
  /** The label is an identifier (a number): shown as an LTR island. */
  numeric?: boolean;
  onSelect: () => void;
};

export const facetIcons: Record<FilterFacet, typeof Tag> = {
  starred: Star,
  contact: User,
  tag: Tag,
  intent: Lightbulb,
  date: Calendar,
  direction: PhoneIncoming,
  match: ScanSearch,
};

const kindIcons: Record<Exclude<SuggestionKind, 'group'>, typeof Tag> = {
  contact: User,
  tag: Tag,
  intent: Lightbulb,
  starred: Star,
  direction: PhoneIncoming,
  'date-preset': Calendar,
  call: Phone,
  words: Search,
};

function Matched({ text, query }: { text: string; query: string }) {
  const range = matchRange(text, query);
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range[0])}
      <b className="font-semibold underline decoration-2 decoration-primary underline-offset-3">
        {text.slice(range[0], range[1])}
      </b>
      {text.slice(range[1])}
    </>
  );
}

function SuggestionIcon({ s }: { s: SearchSuggestionData }) {
  if (s.kind === 'tag' && s.colour) {
    return <span className={cn('size-2.5 rounded-full', tagDotClass[s.colour])} />;
  }
  const Icon = s.kind === 'group' ? facetIcons[s.facet ?? 'tag'] : kindIcons[s.kind];
  return <Icon className="size-4" />;
}

export type SearchSuggestionProps = Omit<ComponentProps<'div'>, 'onSelect'> & {
  suggestion: SearchSuggestionData;
  query: string;
  /** The keyboard highlight (`aria-selected`). */
  highlighted?: boolean;
  /** The ↵ hint on the highlighted row, desktop only. */
  enterHint?: ReactNode;
};

/** One thing the typed text could mean: a filter value, a call, a picker, or the word search. */
export function SearchSuggestion({
  suggestion,
  query,
  highlighted = false,
  enterHint = '↵',
  className,
  ...props
}: SearchSuggestionProps) {
  return (
    <div
      data-component="SearchSuggestion"
      data-kind={suggestion.kind}
      role="option"
      tabIndex={-1}
      aria-selected={highlighted}
      className={cn(
        'group/sg grid min-h-12 w-full cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-foreground aria-selected:bg-accent',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground group-aria-selected/sg:bg-card"
      >
        <SuggestionIcon s={suggestion} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          dir={suggestion.numeric ? 'ltr' : 'auto'}
          className={cn('truncate text-base text-ui-start', suggestion.numeric && 'tabular')}
        >
          <Matched text={suggestion.label} query={query} />
        </span>
        <span className="truncate text-muted-foreground text-xs">{suggestion.meta}</span>
      </span>
      <Kbd aria-hidden className="invisible group-aria-selected/sg:visible max-md:hidden">
        {enterHint}
      </Kbd>
    </div>
  );
}
