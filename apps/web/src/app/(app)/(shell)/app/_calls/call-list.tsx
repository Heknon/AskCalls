'use client';

import { getCall } from '@askcalls/client-core/calls';
import type { ClientContext } from '@askcalls/client-core/context';
import { highlightRanges } from '@askcalls/client-core/search';
import type { Contact } from '@askcalls/client-core/userdata';
import type { CallMeta } from '@askcalls/domain';
import { CallRow, type CallRowAction } from '@askcalls/ui/components/CallRow';
import { formatDuration, formatWhen } from '@askcalls/ui/lib/format';
import { Card } from '@askcalls/ui/primitives/card';
import { Spinner } from '@askcalls/ui/primitives/spinner';
import { ExternalLink, FolderOpen, Star, Tag, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { contactName, DIRECTION, startedAt, tagChips, whatsappHref } from './present';
import type { Feed, FeedItem } from './use-call-feed';
import { useWindowList } from './use-window-list';

type Passage = { text: string; hits: string[] } | null;

export type CallListProps = {
  ctx: ClientContext;
  feed: Feed;
  contacts: readonly Contact[];
  intentLabel: (id: string) => string;
  locale: string;
  cursor: number;
  onCursor: (index: number) => void;
  onOpen: (item: FeedItem) => void;
  onStar: (item: FeedItem, starred: boolean) => void;
  onTags: (item: FeedItem) => void;
  onDelete: (item: FeedItem) => void;
  /** Registers the list's scroll-to-row for the j / k cursor. */
  scrollRef: { current: ((index: number) => void) | null };
};

const ROW_ESTIMATE = 76;
const SEARCH_ROW_ESTIMATE = 120;

/**
 * The calls as one virtualized list in a card. Each row decrypts its metadata when it is first
 * rendered and shows the lock placeholder until then; keyword results look up their passage in
 * the decrypted transcript, because the server never sees words.
 */
export function CallList({
  ctx,
  feed,
  contacts,
  intentLabel,
  locale,
  cursor,
  onCursor,
  onOpen,
  onStar,
  onTags,
  onDelete,
  scrollRef,
}: CallListProps) {
  const t = useTranslations('calls');
  const tc = useTranslations('common');
  const tcall = useTranslations('call');
  const listRef = useRef<HTMLUListElement>(null);
  const passages = useRef(new Map<string, Passage>());
  const [, setPassageVersion] = useState(0);
  const search = feed.mode === 'search';
  const win = useWindowList(
    listRef,
    feed.items.length,
    search ? SEARCH_ROW_ESTIMATE : ROW_ESTIMATE,
  );
  scrollRef.current = win.scrollToIndex;

  const { hasMore, loadingMore, loadMore } = feed;
  useEffect(() => {
    if (hasMore && !loadingMore && win.end >= feed.items.length - 5) loadMore();
  }, [win.end, feed.items.length, hasMore, loadingMore, loadMore]);

  const formsKey = feed.forms.join('\u0000');
  // biome-ignore lint/correctness/useExhaustiveDependencies: passages belong to one set of forms
  useEffect(() => {
    passages.current = new Map();
  }, [formsKey]);

  const findPassage = (id: string) => {
    if (passages.current.has(id)) return;
    passages.current.set(id, null);
    const forms = new Set(feed.forms);
    getCall(ctx, id).then(
      (call) => {
        for (const seg of call.transcript.segments) {
          const ranges = highlightRanges(seg.text, forms);
          if (ranges.length) {
            passages.current.set(id, {
              text: seg.text,
              hits: ranges.map((r) => seg.text.slice(r.start, r.end)),
            });
            setPassageVersion((v) => v + 1);
            return;
          }
        }
      },
      () => {},
    );
  };

  const labels = {
    star: tc('star'),
    unstar: tc('unstar'),
    hiddenNumber: tc('hiddenNumber'),
    moreActions: tc('moreActions'),
    direction: {
      incoming: tc('incoming'),
      outgoing: tc('outgoing'),
      unknown: tc('unknownDirection'),
    },
  };

  const rows = feed.items.slice(win.start, win.end);
  let firstLocked = true;
  return (
    <Card className="overflow-hidden max-md:-mx-4 max-md:rounded-none max-md:border-x-0">
      <ul ref={listRef} aria-label={t('row.list')} className="m-0 list-none p-0">
        <li aria-hidden className="border-0 p-0" style={{ height: win.before }} />
        {rows.map((item, i) => {
          const index = win.start + i;
          const meta = feed.metas.get(item.id);
          const decrypting = !meta && firstLocked;
          if (!meta) firstLocked = false;
          return (
            <FeedRow
              key={item.id}
              item={item}
              meta={meta}
              passage={item.snippet ? null : (passages.current.get(item.id) ?? null)}
              search={search}
              needsPassage={search && !item.snippet && feed.forms.length > 0}
              onPassage={findPassage}
              onMeta={feed.noteMeta}
              contacts={contacts}
              intentLabel={intentLabel}
              locale={locale}
              selected={index === cursor}
              setSize={feed.hasMore ? -1 : feed.items.length}
              posInSet={index + 1}
              labels={{ ...labels, ...(decrypting && { decrypting: t('row.decrypting') }) }}
              detail={(m) =>
                t('row.detail', {
                  direction: labels.direction[DIRECTION[m.direction]],
                  when: formatWhen(startedAt(m, item.day), locale),
                  duration: formatDuration(m.durationSec ?? 0, locale, true),
                })
              }
              onStar={(v) => {
                onCursor(index);
                onStar(item, v);
              }}
              actions={(m) => {
                const wa = whatsappHref(m.phoneE164);
                const list: CallRowAction[] = [
                  {
                    key: 'open',
                    label: t('row.open'),
                    icon: <FolderOpen aria-hidden />,
                    onSelect: () => onOpen(item),
                  },
                  {
                    key: 'star',
                    label: item.starred ? tc('unstar') : tc('star'),
                    icon: <Star aria-hidden />,
                    onSelect: () => onStar(item, !item.starred),
                  },
                  {
                    key: 'tags',
                    label: t('row.tags'),
                    icon: <Tag aria-hidden />,
                    onSelect: () => onTags(item),
                  },
                ];
                if (wa) {
                  list.push({
                    key: 'whatsapp',
                    label: tcall('whatsapp'),
                    icon: <ExternalLink aria-hidden />,
                    onSelect: () => window.open(wa, '_blank', 'noopener,noreferrer'),
                  });
                }
                list.push({
                  key: 'delete',
                  label: tcall('delete.action'),
                  icon: <Trash2 aria-hidden />,
                  destructive: true,
                  separated: true,
                  onSelect: () => onDelete(item),
                });
                return list;
              }}
            />
          );
        })}
        <li aria-hidden className="border-0 p-0" style={{ height: win.after }} />
      </ul>
      {loadingMore ? (
        <p
          role="status"
          className="flex items-center justify-center gap-2 border-border border-t py-3 text-muted-foreground text-sm"
        >
          <Spinner />
          {t('loadingMore')}
        </p>
      ) : null}
    </Card>
  );
}

type FeedRowProps = {
  item: FeedItem;
  meta: CallMeta | undefined;
  passage: Passage;
  search: boolean;
  needsPassage: boolean;
  onPassage: (id: string) => void;
  onMeta: (id: string, meta: CallMeta) => void;
  contacts: readonly Contact[];
  intentLabel: (id: string) => string;
  locale: string;
  selected: boolean;
  setSize: number;
  posInSet: number;
  labels: Parameters<typeof CallRow>[0]['labels'];
  detail: (meta: CallMeta) => string;
  onStar: (starred: boolean) => void;
  actions: (meta: CallMeta) => CallRowAction[];
};

function FeedRow({
  item,
  meta,
  passage,
  search,
  needsPassage,
  onPassage,
  onMeta,
  contacts,
  intentLabel,
  locale,
  selected,
  setSize,
  posInSet,
  labels,
  detail,
  onStar,
  actions,
}: FeedRowProps) {
  useEffect(() => {
    if (meta) return;
    let stale = false;
    item.meta().then(
      (m) => !stale && onMeta(item.id, m),
      () => {},
    );
    return () => {
      stale = true;
    };
  }, [item, meta, onMeta]);

  useEffect(() => {
    if (needsPassage && meta) onPassage(item.id);
  }, [needsPassage, meta, item.id, onPassage]);

  const common = {
    href: `/app/calls/${item.id}`,
    linkAs: Link,
    locale,
    selected,
    setSize: setSize < 0 ? undefined : setSize,
    posInSet,
    labels,
  };
  if (!meta) return <CallRow {...common} call="locked" />;
  const snippet = item.snippet
    ? {
        text: item.snippet,
        hits: item.highlights.map((h) => item.snippet!.slice(h.start, h.end)),
      }
    : (passage ?? undefined);
  return (
    <CallRow
      {...common}
      context={search ? 'search' : 'list'}
      a11yDetail={detail(meta)}
      onStarredChange={onStar}
      actions={actions(meta)}
      call={{
        name: contactName(meta, contacts),
        phone: meta.phoneE164 ?? undefined,
        direction: DIRECTION[meta.direction],
        startedAt: startedAt(meta, item.day),
        durationSec: meta.durationSec ?? 0,
        starred: item.starred,
        tags: tagChips(item.tags, intentLabel),
        ...(snippet && { snippet }),
      }}
    />
  );
}
