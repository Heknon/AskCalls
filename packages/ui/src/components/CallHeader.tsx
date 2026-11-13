'use client';

import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../primitives/button';
import { CallDirection, type CallDirectionValue } from './CallDirection';
import { CallMeta } from './CallMeta';
import { ContactLabel } from './ContactLabel';
import { DecryptingPlaceholder } from './DecryptingPlaceholder';
import { Kbd } from './Kbd';
import { SignatureBadge, type SignatureBadgeProps } from './SignatureBadge';
import { StarToggle } from './StarToggle';
import { TagChip, type TagChipProps } from './TagChip';

export type CallHeaderProps = {
  /** Decrypted metadata, or `"locked"` while it decrypts. */
  call:
    | {
        name?: string;
        phone?: string;
        hidden?: boolean;
        direction: CallDirectionValue;
        startedAt: Date;
        durationSec: number;
        starred: boolean;
        tags: (TagChipProps & { id: string })[];
      }
    | 'locked';
  signature: SignatureBadgeProps;
  locale: string;
  onStarredChange: (starred: boolean) => void;
  onAddTag: () => void;
  /** The `CallActions` row. */
  actions: ReactNode;
  labels: {
    star: string;
    unstar: string;
    hiddenNumber: string;
    direction: Record<CallDirectionValue, string>;
    addTag: string;
    decrypting?: string;
  };
};

/** Identifies the open call and its trust status. */
export function CallHeader({
  call,
  signature,
  locale,
  onStarredChange,
  onAddTag,
  actions,
  labels,
}: CallHeaderProps) {
  if (call === 'locked') {
    return (
      <header
        data-component="CallHeader"
        aria-busy="true"
        className="flex flex-col gap-3 border-border border-b pb-5"
      >
        <DecryptingPlaceholder className="h-8 w-56" />
        <DecryptingPlaceholder className="w-80 max-w-full" label={labels.decrypting} />
        <DecryptingPlaceholder className="w-40" />
      </header>
    );
  }
  return (
    <header data-component="CallHeader" className="flex flex-col gap-3 border-border border-b pb-5">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <ContactLabel
            context="header"
            name={call.name}
            phone={call.phone}
            hidden={call.hidden}
            hiddenLabel={labels.hiddenNumber}
          />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-muted-foreground text-sm">
            <CallDirection
              direction={call.direction}
              label={labels.direction[call.direction]}
              withLabel
            />
            <span className="inline-flex items-center gap-3">
              <span aria-hidden>·</span>
              <CallMeta
                context="header"
                startedAt={call.startedAt}
                durationSec={call.durationSec}
                locale={locale}
              />
            </span>
            <span className="inline-flex items-center gap-3">
              <span aria-hidden>·</span>
              <SignatureBadge {...signature} />
            </span>
          </div>
        </div>
        <StarToggle
          size="header"
          starred={call.starred}
          onStarredChange={onStarredChange}
          labels={labels}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {call.tags.map(({ id, ...tag }) => (
          <TagChip key={id} {...tag} />
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddTag}
          aria-keyshortcuts="t"
          className="h-5.5 gap-1 rounded-sm border border-input border-dashed px-1.5 font-normal text-muted-foreground text-xs"
        >
          <Plus className="size-3" aria-hidden />
          {labels.addTag}
          <Kbd className="h-4 min-w-4 max-md:hidden">t</Kbd>
        </Button>
      </div>
      {actions}
    </header>
  );
}
