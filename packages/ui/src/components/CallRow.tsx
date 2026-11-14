'use client';

import { Ellipsis, Star } from 'lucide-react';
import type { ElementType, ReactNode } from 'react';
import { cn } from '../lib/cn';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '../primitives/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';
import { CallDirection, type CallDirectionValue } from './CallDirection';
import { CallMeta } from './CallMeta';
import { ContactLabel } from './ContactLabel';
import { DecryptingPlaceholder } from './DecryptingPlaceholder';
import { SearchSnippet } from './SearchSnippet';
import { StarToggle } from './StarToggle';
import { TagChip, type TagChipProps } from './TagChip';

export type CallRowCall = {
  name?: string;
  phone?: string;
  hidden?: boolean;
  direction: CallDirectionValue;
  startedAt: Date;
  durationSec: number;
  starred: boolean;
  tags: (TagChipProps & { id: string })[];
  /** Search context only: the best passage and the words it matched. */
  snippet?: { text: string; hits: string[]; marker?: { label: string; title: string } };
};

export type CallRowAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  /** Draws a separator before this item. */
  separated?: boolean;
  onSelect: () => void;
};

export type CallRowProps = {
  /** Decrypted metadata, or `"locked"` while it is still being decrypted. */
  call: CallRowCall | 'locked';
  /** `search` shows the snippet. */
  context?: 'list' | 'search';
  /** `compact`: the contact detail list. */
  density?: 'comfortable' | 'compact';
  /** The keyboard cursor (`j` / `k`). */
  selected?: boolean;
  href: string;
  /** The router's link component; a plain anchor by default. */
  linkAs?: ElementType;
  /**
   * Read after the contact, so the link is named "Dana Levi, incoming, today 14:32, 8 minutes":
   * ", incoming, today 14:32, 8 minutes".
   */
  a11yDetail?: string;
  locale: string;
  now?: Date;
  onStarredChange?: (starred: boolean) => void;
  /** Row menu and right-click menu: Open, Star, Tags, Open in WhatsApp, Delete. */
  actions?: CallRowAction[];
  labels: {
    star: string;
    unstar: string;
    hiddenNumber: string;
    direction: Record<CallDirectionValue, string>;
    moreActions: string;
    /** Only on the first locked row of a list, so the lock is announced once. */
    decrypting?: string;
  };
  setSize?: number;
  posInSet?: number;
  /** Starts a group of results with this heading: "Related by meaning". */
  section?: string;
};

/** One call in any list: calls, search results, a contact's calls. */
export function CallRow({
  call,
  context = 'list',
  density = 'comfortable',
  selected = false,
  href,
  linkAs: Link = 'a',
  a11yDetail,
  locale,
  now,
  onStarredChange,
  actions,
  labels,
  setSize,
  posInSet,
  section,
}: CallRowProps) {
  const compact = density === 'compact';
  const rowClass = cn(
    'relative grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-0.5 border-border border-b ps-2 pe-3 last:border-b-0 md:grid-cols-[2rem_minmax(0,1fr)_auto] md:gap-x-3 md:gap-y-1 md:ps-2.5 md:pe-4',
    compact ? 'py-2.5' : 'py-3.5',
  );
  const sectionHeading = section ? (
    <span className="col-span-full -mt-1 mb-2 font-medium text-muted-foreground text-xs">
      {section}
    </span>
  ) : null;
  if (call === 'locked') {
    return (
      <li
        data-component="CallRow"
        data-state="locked"
        aria-busy="true"
        aria-setsize={setSize}
        aria-posinset={posInSet}
        className={rowClass}
      >
        {sectionHeading}
        <span className="inline-flex size-8 items-center justify-center text-subtle-foreground">
          <Star className="size-4.5" aria-hidden />
        </span>
        <span className="flex min-w-0 gap-2.5 pt-1.5">
          <DecryptingPlaceholder className="w-30" />
          <DecryptingPlaceholder className="w-28 max-md:hidden" />
        </span>
        <span className="pt-1.5">
          <DecryptingPlaceholder className="w-16" />
        </span>
        {compact ? null : (
          <DecryptingPlaceholder
            shape="paragraph"
            label={labels.decrypting}
            className="col-span-2 col-start-2 mt-2"
          />
        )}
      </li>
    );
  }

  const row = (
    <li
      data-component="CallRow"
      data-context={context}
      data-selected={selected || undefined}
      aria-setsize={setSize}
      aria-posinset={posInSet}
      className={cn(
        rowClass,
        'group/row transition-colors duration-(--duration-instant) hover:bg-accent/60',
        selected &&
          'bg-accent hover:bg-accent before:absolute before:inset-y-0 before:start-0 before:w-0.75 before:bg-primary',
      )}
    >
      {sectionHeading}
      <StarToggle
        starred={call.starred}
        onStarredChange={(v) => onStarredChange?.(v)}
        labels={labels}
        className="relative z-10 -mt-1"
      />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Link
          href={href}
          className="min-w-0 rounded-xs text-foreground no-underline after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-xs focus-visible:after:outline-2 focus-visible:after:outline-ring focus-visible:after:-outline-offset-2"
        >
          <ContactLabel
            name={call.name}
            phone={call.phone}
            hidden={call.hidden}
            hiddenLabel={labels.hiddenNumber}
            className="[&_[data-part=number]]:max-md:hidden"
          />
          {a11yDetail ? <span className="sr-only">{a11yDetail}</span> : null}
        </Link>
        <CallDirection direction={call.direction} label={labels.direction[call.direction]} />
      </div>
      <div className="flex items-center gap-1">
        <CallMeta
          startedAt={call.startedAt}
          durationSec={call.durationSec}
          locale={locale}
          now={now}
          className="leading-5"
        />
        {actions?.length ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={labels.moreActions}
              className="relative z-10 -my-1 -me-2 inline-flex size-7 cursor-pointer items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-muted focus-visible:opacity-100 group-hover/row:opacity-100 data-[state=open]:opacity-100 max-md:hidden"
            >
              <Ellipsis className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {actions.map((a) => [
                a.separated ? <DropdownMenuSeparator key={`${a.key}-sep`} /> : null,
                <DropdownMenuItem
                  key={a.key}
                  variant={a.destructive ? 'destructive' : undefined}
                  onSelect={a.onSelect}
                >
                  {a.icon}
                  {a.label}
                </DropdownMenuItem>,
              ])}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {context === 'search' && call.snippet ? (
        <SearchSnippet
          text={call.snippet.text}
          hits={call.snippet.hits}
          {...(call.snippet.marker && { marker: call.snippet.marker })}
          className="col-span-2 col-start-2 mt-0.5"
        />
      ) : null}
      {call.tags.length > 0 ? (
        <div className="relative z-10 col-span-2 col-start-2 mt-1.5 flex w-fit flex-wrap gap-1.5">
          {call.tags.map(({ id, ...tag }) => (
            <TagChip key={id} {...tag} />
          ))}
        </div>
      ) : null}
    </li>
  );

  if (!actions?.length) return row;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        {actions.map((a) => [
          a.separated ? <ContextMenuSeparator key={`${a.key}-sep`} /> : null,
          <ContextMenuItem
            key={a.key}
            variant={a.destructive ? 'destructive' : undefined}
            onSelect={a.onSelect}
          >
            {a.icon}
            {a.label}
          </ContextMenuItem>,
        ])}
      </ContextMenuContent>
    </ContextMenu>
  );
}
