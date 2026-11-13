'use client';

import { getCall, starCall } from '@askcalls/client-core/calls';
import { ingestCall } from '@askcalls/client-core/ingest';
import { CallRow } from '@askcalls/ui/components/CallRow';
import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { EmptyState } from '@askcalls/ui/components/EmptyState';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { FoldedFilterSummary, useFolded } from '@askcalls/ui/components/FoldedFilterSummary';
import { ResultLine } from '@askcalls/ui/components/ResultLine';
import { SearchBox } from '@askcalls/ui/components/SearchBox';
import type { FilterFacet } from '@askcalls/ui/components/SearchSuggestion';
import { StatusBanner } from '@askcalls/ui/components/StatusBanner';
import { formatDuration, formatPhone, formatWhen } from '@askcalls/ui/lib/format';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import { Spinner } from '@askcalls/ui/primitives/spinner';
import { Phone, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EmbedderStatus } from '../../../../../client/adapters/embedder/embedder';
import { useNotify } from '../../../../../client/notices/notices';
import { useAppSession, useUnlocked } from '../../../../../client/session/session';
import { useShortcut } from '../../../../../client/shortcuts/shortcuts';
import { intlLocale } from '../../../../../i18n/locales';
import {
  SAMPLE_CALLS,
  sampleStartedAt,
} from '../../../(gate)/app/welcome/_onboarding/sample-calls';
import { Screen } from '../../_shell/screen';
import { useSkeletonDelay } from '../../_shell/states';
import { CallList } from './call-list';
import { type ContactOption, FilterSentenceBlock } from './filter-sentence';
import {
  DATE_PRESETS,
  EMPTY_FILTERS,
  type Filters,
  filtersToParams,
  isFiltered,
  parseFilters,
} from './filters';
import { recalledSearch, rememberSearch } from './memory';
import { contactName, startedAt, tagColour } from './present';
import { buildSuggestions } from './suggestions';
import { TagDialog } from './tag-dialog';
import { type FeedItem, isSearchQuery, useCallFeed } from './use-call-feed';
import { useCatalogs } from './use-catalogs';
import { useDeleteCall, usePendingDeletes } from './use-delete';

const MB = 1024 * 1024;

function useEmbedderStatus(
  subscribe: (l: (s: EmbedderStatus) => void) => () => void,
  initial: EmbedderStatus | null,
) {
  const [status, setStatus] = useState(initial);
  useEffect(() => subscribe(setStatus), [subscribe]);
  return status;
}

/** C1 Calls list and C2 search: the sentence filters over a virtualized list. */
export function CallsScreen() {
  const t = useTranslations('calls');
  const tc = useTranslations('common');
  const tcall = useTranslations('call');
  const th = useTranslations('shell.shortcuts.hints');
  const tk = useTranslations('shell.shortcuts.keys');
  const { ctx, client, me } = useUnlocked();
  const { refreshMe } = useAppSession();
  const notify = useNotify();
  const router = useRouter();
  const params = useSearchParams();
  const uiLocale = useLocale();
  const locale = intlLocale(uiLocale);
  const query = params.toString();

  const [recalled] = useState(() => {
    const r = recalledSearch();
    return r && r.query === query ? r : null;
  });
  const [text, setText] = useState(recalled?.text ?? '');
  const [searched, setSearched] = useState(recalled?.text ?? '');
  const [numbers, setNumbers] = useState<string[]>(recalled?.numbers ?? []);
  const [excluded, setExcluded] = useState<string[]>(recalled?.excluded ?? []);
  const [recent, setRecent] = useState<FilterFacet[]>([]);
  const [picker, setPicker] = useState<{ facet: FilterFacet; query: string } | null>(null);
  const [cursor, setCursor] = useState(-1);
  const [tagTarget, setTagTarget] = useState<FeedItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FeedItem | null>(null);
  const [importing, setImporting] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<((index: number) => void) | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setSearched(text), 250);
    return () => clearTimeout(id);
  }, [text]);
  const firstSearch = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new search resets the exclusions
  useEffect(() => {
    if (firstSearch.current) firstSearch.current = false;
    else setExcluded([]);
  }, [searched]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new query starts without a cursor
  useEffect(() => setCursor(-1), [searched, query]);

  const urlFilters = useMemo(() => parseFilters(new URLSearchParams(query)), [query]);
  const filters: Filters = useMemo(() => ({ ...urlFilters, numbers }), [urlFilters, numbers]);
  const setFilters = (next: Filters, facet: FilterFacet) => {
    setNumbers(next.numbers);
    setRecent((r) => [facet, ...r.filter((f) => f !== facet)]);
    setCursor(-1);
    const p = filtersToParams(next).toString();
    router.replace(p ? `/app?${p}` : '/app', { scroll: false });
  };

  const pending = usePendingDeletes();
  const feed = useCallFeed(ctx, { text: searched, filters, excluded }, pending);
  const catalogs = useCatalogs(ctx);
  const deleteCall = useDeleteCall(ctx);
  const model = useEmbedderStatus(
    useCallback((l) => client.onEmbedderStatus(l), [client]),
    client.embedderStatus(),
  );

  // Calls that arrive while the list is open (inbox imports after unlock) reload it.
  const knownCalls = useRef(me.usage.calls);
  const { reload } = feed;
  useEffect(() => {
    if (me.usage.calls > knownCalls.current) reload();
    knownCalls.current = me.usage.calls;
  }, [me.usage.calls, reload]);

  const ids = useMemo(() => feed.items.map((i) => i.id), [feed.items]);
  useEffect(() => {
    if (feed.status !== 'ready') return;
    rememberSearch(ctx.session, {
      text: searched,
      numbers,
      forms: feed.forms,
      excluded,
      ids,
      query,
    });
  }, [ctx, feed.status, feed.forms, searched, numbers, excluded, ids, query]);

  const { contacts: contactList, tags: tagList, intents } = catalogs;
  // biome-ignore lint/correctness/useExhaustiveDependencies: metaVersion tracks feed.metas
  const decrypted = useMemo(
    () =>
      feed.items.flatMap((item) => {
        const meta = feed.metas.get(item.id);
        return meta ? [{ item, meta }] : [];
      }),
    [feed.items, feed.metaVersion],
  );

  const contactOptions = useMemo<ContactOption[]>(() => {
    const out: ContactOption[] = contactList.map((c) => ({
      value: c.id,
      label: c.name,
      kind: 'contact',
    }));
    const known = new Set(contactList.flatMap((c) => c.phones.map((p) => p.replace(/\D/g, ''))));
    const seen = new Set<string>();
    for (const { meta } of decrypted) {
      const phone = meta.phoneE164;
      if (!phone || seen.has(phone) || known.has(phone.replace(/\D/g, ''))) continue;
      seen.add(phone);
      out.push({
        value: phone,
        label: meta.contactName ?? formatPhone(phone),
        numeric: !meta.contactName,
        kind: 'number',
      });
    }
    for (const n of numbers) {
      if (!seen.has(n))
        out.push({ value: n, label: formatPhone(n), numeric: true, kind: 'number' });
    }
    return out;
  }, [contactList, decrypted, numbers]);

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const focusBox = () => blockRef.current?.querySelector('input')?.focus();

  const suggestions = buildSuggestions(
    text,
    {
      contacts: contactOptions,
      tags: tagList.map((x) => ({ id: x.id, name: x.name, colour: tagColour(x.id, x.color) })),
      intents,
      calls: decrypted.slice(0, 200).map(({ item, meta }) => {
        const name = contactName(meta, contactList);
        return {
          id: item.id,
          contact: name ?? (meta.phoneE164 ? formatPhone(meta.phoneE164) : tc('hiddenNumber')),
          numeric: !name,
          meta: `${formatWhen(startedAt(meta, item.day), locale)} · ${formatDuration(meta.durationSec ?? 0, locale)}`,
        };
      }),
      dates: DATE_PRESETS.map((p) => ({ preset: p, label: t(`picker.options.${p}`) })),
      directions: [
        { value: 'in', label: t('picker.options.in') },
        { value: 'out', label: t('picker.options.out') },
      ],
      groups: (['tag', 'intent', 'contact', 'date'] as const).map((facet) => ({
        facet,
        word: t(`groupWords.${facet}`),
        label: t(`groups.${facet}`),
        size:
          facet === 'tag'
            ? tagList.length
            : facet === 'intent'
              ? intents.length
              : facet === 'contact'
                ? contactOptions.length
                : DATE_PRESETS.length,
      })),
    },
    filters,
    {
      kinds: {
        contact: t('kinds.contact'),
        tag: t('kinds.tag'),
        intent: t('kinds.intent'),
        date: t('kinds.date'),
        direction: t('kinds.direction'),
      },
      contact: t('search.s.contact'),
      only: (kind) => t('search.s.only', { kind }),
      add: (kind) => t('search.s.add', { kind }),
      chosen: (kind) => t('search.s.chosen', { kind }),
      group: (kind, n) => t('search.s.group', { kind, n }),
      callWith: (contact) => t('search.s.callWith', { contact }),
      words: (q) => t('search.s.words', { q }),
      wordsMeta: t('search.s.wordsMeta'),
      starred: t('search.s.starred'),
      onlyThese: t('search.s.onlyThese'),
    },
    {
      contact: (value, kind) =>
        kind === 'contact'
          ? setFilters({ ...filters, contacts: toggle(filters.contacts, value) }, 'contact')
          : setFilters({ ...filters, numbers: toggle(filters.numbers, value) }, 'contact'),
      tag: (id) => setFilters({ ...filters, tags: toggle(filters.tags, id) }, 'tag'),
      intent: (id) => setFilters({ ...filters, intents: toggle(filters.intents, id) }, 'intent'),
      starred: () => setFilters({ ...filters, starred: true }, 'starred'),
      date: (preset) => setFilters({ ...filters, date: preset }, 'date'),
      direction: (direction) => setFilters({ ...filters, direction }, 'direction'),
      group: (facet) => setPicker({ facet, query: '' }),
      call: (id) => router.push(`/app/calls/${id}`),
      words: () => setSearched(text),
    },
  );

  const items = feed.items;
  const current = cursor >= 0 ? items[cursor] : undefined;
  const move = (by: number) => {
    if (items.length === 0) return;
    const next = Math.min(items.length - 1, Math.max(0, cursor + by));
    setCursor(next);
    scrollRef.current?.(next);
  };

  const star = async (item: FeedItem, starred: boolean) => {
    feed.patch(item.id, { starred });
    try {
      const tagToks = await starCall(ctx, item, starred);
      const directory = await ctx.tagDirectory();
      feed.patch(item.id, { starred, tagToks, tags: directory.resolve(tagToks) });
    } catch {
      feed.patch(item.id, { starred: !starred });
      notify({ kind: 'error', title: tcall('starFailed') });
    }
  };

  const remove = async (item: FeedItem) => {
    const decryptedCall = await getCall(ctx, item.id).catch(() => undefined);
    deleteCall(item.id, decryptedCall ? { decrypted: decryptedCall } : {});
  };

  const importSample = async () => {
    setImporting(true);
    const sample = SAMPLE_CALLS[uiLocale === 'he' ? 'he' : 'en'];
    const r = await ingestCall(ctx, {
      source: 'app',
      transcript: { segments: sample.segments, language: sample.language },
      meta: {
        phone: sample.phone,
        contactName: sample.contactName,
        direction: sample.direction,
        startedAt: sampleStartedAt(sample),
      },
    }).catch(() => ({ status: 'failed' as const }));
    setImporting(false);
    if (r.status === 'failed') return notify({ kind: 'error', title: t('empty.sampleFailed') });
    refreshMe().catch(() => {});
    feed.reload();
  };

  const searching = text.trim() !== '' || searched.trim() !== '';
  useShortcut({ keys: ['/'], group: 'calls', label: tk('search'), run: focusBox });
  useShortcut({
    keys: ['j'],
    displayKeys: ['j', 'k'],
    group: 'calls',
    label: tk('nextPrevious'),
    run: () => move(1),
  });
  useShortcut({ keys: ['k'], run: () => move(-1) });
  useShortcut({
    keys: ['Enter'],
    group: 'calls',
    label: tk('open'),
    run: () => current && router.push(`/app/calls/${current.id}`),
    enabled: !!current,
  });
  useShortcut({
    keys: ['s'],
    group: 'calls',
    label: tk('star'),
    run: () => current && void star(current, !current.starred),
    enabled: !!current,
  });
  useShortcut({
    keys: ['t'],
    group: 'calls',
    label: tk('tags'),
    run: () => current && setTagTarget(current),
    enabled: !!current,
  });
  useShortcut({
    keys: ['Escape'],
    run: () => (cursor >= 0 ? setCursor(-1) : setText('')),
    enabled: cursor >= 0 || text !== '',
  });

  const folded = useFolded(blockRef);
  const showSkeleton = useSkeletonDelay(feed.status === 'loading');
  const meaning = filters.match === 'meaning' && searched.trim() !== '';
  const meaningBusy = meaning && model?.state === 'loading';
  const unfiltered = !isSearchQuery({ text: searched, filters, excluded }) && !isFiltered(filters);
  const total =
    feed.status !== 'ready' || feed.refreshing
      ? undefined
      : unfiltered && feed.hasMore
        ? Math.max(items.length, me.usage.calls - pending.size)
        : items.length;
  const totalIsExact = unfiltered || !feed.hasMore;
  const formatTotal = (n: number) =>
    totalIsExact ? t('results.count', { n }) : t('results.countMore', { n });

  const sortOptions = (
    meaning ? (['best', 'oldest', 'longest'] as const) : (['newest', 'oldest', 'longest'] as const)
  ).map((value) => ({ value, label: t(`results.sorts.${value}`) }));
  const sortValue =
    meaning && filters.sort === 'newest'
      ? 'best'
      : !meaning && filters.sort === 'best'
        ? 'newest'
        : filters.sort;

  const variants = feed.alsoMatched
    .filter((v) => !excluded.includes(v))
    .map((term) => ({ term, onExclude: () => setExcluded((x) => [...x, term]) }));

  const summaryParts = [
    ...(searched.trim() ? [`“${searched.trim()}”`] : []),
    ...(filters.starred ? [t('filters.calls.starred')] : []),
    ...filters.tags.map((id) => tagList.find((x) => x.id === id)?.name ?? ''),
    ...filters.intents.map(catalogs.intentLabel),
    ...(typeof filters.date === 'string' ? [t(`filters.date.${filters.date}`)] : []),
    ...(filters.direction !== 'all' ? [t(`filters.dir.${filters.direction}`)] : []),
  ].filter(Boolean);

  const waysOut = () => {
    const out: { key: string; label: string; run: () => void }[] = [];
    if (searched.trim()) {
      out.push({
        key: 'text',
        label: t('noMatches.clearSearch', { q: searched.trim() }),
        run: () => {
          setText('');
          setSearched('');
        },
      });
    }
    for (const facet of recent) {
      if (out.length >= 2) break;
      const reset: Partial<Filters> | null =
        facet === 'starred' && filters.starred
          ? { starred: false }
          : facet === 'contact' && (filters.contacts.length || filters.numbers.length)
            ? { contacts: [], numbers: [] }
            : facet === 'tag' && filters.tags.length
              ? { tags: [] }
              : facet === 'intent' && filters.intents.length
                ? { intents: [] }
                : facet === 'date' && filters.date
                  ? { date: null }
                  : facet === 'direction' && filters.direction !== 'all'
                    ? { direction: 'all' }
                    : null;
      if (reset && facet !== 'match') {
        out.push({
          key: facet,
          label: t(`noMatches.${facet}`),
          run: () => setFilters({ ...filters, ...reset }, facet),
        });
      }
    }
    return out.slice(0, 2);
  };

  const placeholderRows = (
    <Card className="overflow-hidden max-md:-mx-4 max-md:rounded-none max-md:border-x-0">
      <ul aria-busy="true" className="m-0 list-none p-0">
        {Array.from({ length: 6 }, (_, i) => (
          <CallRow
            // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders
            key={i}
            call="locked"
            href="/app"
            locale={locale}
            labels={{
              star: tc('star'),
              unstar: tc('unstar'),
              hiddenNumber: tc('hiddenNumber'),
              moreActions: tc('moreActions'),
              direction: {
                incoming: tc('incoming'),
                outgoing: tc('outgoing'),
                unknown: tc('unknownDirection'),
              },
              ...(i === 0 && { decrypting: t('row.decrypting') }),
            }}
          />
        ))}
      </ul>
    </Card>
  );

  let body: ReactNode;
  if (feed.status === 'loading') {
    body = showSkeleton ? placeholderRows : <div aria-busy="true" className="min-h-60" />;
  } else if (feed.status === 'error') {
    const offline = typeof navigator !== 'undefined' && !navigator.onLine;
    body = (
      <ErrorState
        scope="panel"
        title={offline ? t('search.offline') : searching ? t('search.error') : t('error.title')}
        description={searching ? undefined : t('error.body')}
        retry={{ label: tc('retry'), onRetry: feed.reload }}
      />
    );
  } else if (items.length === 0 && unfiltered && !feed.hasMore) {
    body = (
      <EmptyState
        reason="first-use"
        icon={Phone}
        title={t('empty.title')}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" asChild>
              <Link href="/app/upload">
                <Upload className="size-4" aria-hidden />
                {t('empty.upload')}
              </Link>
            </Button>
            <Button variant="outline" loading={importing} onClick={importSample}>
              {t('empty.sample')}
            </Button>
          </div>
        }
      />
    );
  } else if (items.length === 0 && !feed.hasMore) {
    const ways = waysOut();
    body =
      searched.trim() || ways.length > 0 ? (
        <EmptyState
          reason="no-results"
          title={t('noMatches.title')}
          action={
            ways.length ? (
              <div className="flex flex-wrap justify-center gap-2">
                {ways.map((w) => (
                  <Button key={w.key} variant="outline" onClick={w.run}>
                    <bdi>{w.label}</bdi>
                  </Button>
                ))}
              </div>
            ) : undefined
          }
        />
      ) : (
        <EmptyState
          reason="filtered"
          title={t('filtered.title')}
          action={
            <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS, 'starred')}>
              {t('filtered.clear')}
            </Button>
          }
        />
      );
  } else {
    body = (
      <CallList
        ctx={ctx}
        feed={feed}
        contacts={contactList}
        intentLabel={catalogs.intentLabel}
        locale={locale}
        cursor={cursor}
        onCursor={setCursor}
        onOpen={(item) => router.push(`/app/calls/${item.id}`)}
        onStar={(item, v) => void star(item, v)}
        onTags={setTagTarget}
        onDelete={setDeleteTarget}
        scrollRef={scrollRef}
      />
    );
  }

  const uploadLabel = t('upload');
  return (
    <Screen
      title={t('title')}
      hints={[
        { keys: ['/'], label: th('search') },
        { keys: ['j', 'k'], label: th('move') },
        { keys: ['s'], label: th('star') },
      ]}
      actions={
        <Button variant="primary" asChild>
          <Link href="/app/upload">
            <Upload className="size-4" aria-hidden />
            {uploadLabel}
          </Link>
        </Button>
      }
      mobileAction={
        <Button variant="ghost" size="icon" asChild>
          <Link href="/app/upload" aria-label={uploadLabel}>
            <Upload className="size-5" aria-hidden />
          </Link>
        </Button>
      }
    >
      {me.usage.calls >= me.limits.maxCalls ? (
        <StatusBanner condition="limit" className="mb-4">
          {t('limit', { n: me.limits.maxCalls })}
        </StatusBanner>
      ) : null}
      <div ref={blockRef} className="flex flex-col gap-3 pb-4 md:gap-4 md:pb-5">
        <SearchBox
          value={text}
          onChange={(v) => {
            setText(v);
            setCursor(-1);
          }}
          onSubmit={(v) => setSearched(v)}
          placeholder={t('search.placeholder')}
          labels={{ search: t('search.label'), clear: t('search.clear') }}
          suggestions={suggestions.values}
          records={suggestions.records}
          wordSearch={suggestions.wordSearch}
          slashShortcut={false}
          onArrowDownOut={() => {
            if (items.length === 0) return;
            (document.activeElement as HTMLElement | null)?.blur();
            setCursor(0);
            scrollRef.current?.(0);
          }}
        />
        <FilterSentenceBlock
          filters={filters}
          onChange={setFilters}
          catalogs={catalogs}
          contacts={contactOptions}
          open={picker}
          onOpenChange={setPicker}
          hasText={searched.trim() !== ''}
          meaningBusy={meaningBusy}
          total={totalIsExact ? total : undefined}
        />
        {feed.status === 'error' ? null : (
          <ResultLine
            total={total}
            formatTotal={formatTotal}
            variants={feed.mode === 'search' ? variants : []}
            labels={{
              alsoMatched: t('results.alsoMatched'),
              exclude: (term) => t('results.exclude', { term }),
              sort: t('results.sort'),
            }}
            sort={{
              value: sortValue,
              options: sortOptions,
              onChange: (v) => {
                const p = filtersToParams({ ...filters, sort: v as Filters['sort'] }).toString();
                router.replace(p ? `/app?${p}` : '/app', { scroll: false });
              },
            }}
            status={
              meaningBusy && model?.state === 'loading' ? (
                <>
                  <Spinner />
                  {t('results.meaningLoading', {
                    size: `${Math.max(1, Math.round(model.progress.total / MB))} MB`,
                  })}
                </>
              ) : undefined
            }
          />
        )}
      </div>
      {folded ? (
        <FoldedFilterSummary
          summary={summaryParts.length ? <bdi>{summaryParts.join(' · ')}</bdi> : t('folded.all')}
          total={total}
          label={t('folded.show')}
          onShow={() => {
            window.scrollTo({ top: 0 });
            focusBox();
          }}
        />
      ) : null}
      {body}
      {tagTarget ? (
        <TagDialog
          open
          onOpenChange={(o) => !o && setTagTarget(null)}
          ctx={ctx}
          call={tagTarget}
          selected={tagTarget.tags.filter((x) => x.kind === 'tag').map((x) => x.id)}
          catalog={tagList}
          onCatalogChange={catalogs.reload}
          onChange={async (tagToks) => {
            const directory = await ctx.tagDirectory();
            const tags = directory.resolve(tagToks);
            feed.patch(tagTarget.id, { tagToks, tags });
            setTagTarget({ ...tagTarget, tagToks, tags });
          }}
        />
      ) : null}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={tcall('delete.title')}
        description={tcall('delete.body')}
        confirmLabel={tcall('delete.action')}
        cancelLabel={tc('cancel')}
        onConfirm={() => {
          if (deleteTarget) void remove(deleteTarget);
          setDeleteTarget(null);
        }}
      />
    </Screen>
  );
}
