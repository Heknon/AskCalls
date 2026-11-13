'use client';

import { listCalls } from '@askcalls/client-core/calls';
import type { ClientContext } from '@askcalls/client-core/context';
import { meaningHighlights } from '@askcalls/client-core/meaning';
import { type HighlightRange, searchCalls } from '@askcalls/client-core/search';
import { intentTagId, type ResolvedTag } from '@askcalls/client-core/tags';
import type { CallMeta, DurationBucket } from '@askcalls/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLockWipe } from '../../../../../client/session/session';
import { dateRange, type Filters, filterByDirection } from './filters';

export interface FeedItem {
  id: string;
  day: number;
  durationBucket: DurationBucket;
  tags: ResolvedTag[];
  tagToks: readonly bigint[];
  starred: boolean;
  hasRecording: boolean;
  /** Decrypts once, when first asked (the row renders, a filter needs it). */
  meta: () => Promise<CallMeta>;
  snippet: string | null;
  /** The snippet's language and chunk when it came from a semantic match. */
  snippetLang: string | null;
  snippetTranslated: boolean;
  snippetOrd: number | null;
  highlights: HighlightRange[];
}

export interface FeedQuery {
  text: string;
  filters: Filters;
  excluded: string[];
}

export interface Feed {
  status: 'loading' | 'error' | 'ready';
  error: unknown;
  /** True while a newer query loads; the previous items stay. */
  refreshing: boolean;
  items: FeedItem[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  reload: () => void;
  /** `search`: the server got words, contacts or meaning; otherwise the plain list. */
  mode: 'list' | 'search';
  alsoMatched: string[];
  forms: string[];
  /** Metadata decrypted so far (catalog suggestions, sort, direction). */
  metas: ReadonlyMap<string, CallMeta>;
  /** Changes whenever `metas` gains an entry. */
  metaVersion: number;
  noteMeta: (id: string, meta: CallMeta) => void;
  patch: (id: string, change: Partial<Pick<FeedItem, 'starred' | 'tags' | 'tagToks'>>) => void;
}

const PAGE = 50;
/** Sorting other than newest-first needs every call; 500 is the free-tier maximum. */
const MAX_PAGES = 20;
/** With direction set, keep fetching until this many new rows show (or the end). */
const MIN_VISIBLE = 12;

const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export const isSearchQuery = (q: FeedQuery) =>
  q.text.trim() !== '' || q.filters.contacts.length > 0 || q.filters.numbers.length > 0;

type Page = {
  items: FeedItem[];
  nextCursor: string | null;
  alsoMatched: string[];
  forms: string[];
  /** The query's embedding on a meaning search. */
  vector: Float32Array | null;
};

async function fetchPage(ctx: ClientContext, q: FeedQuery, cursor: string | null): Promise<Page> {
  const f = q.filters;
  const { from, to } = dateRange(f.date);
  const dates = { ...(from && { dateFrom: from }), ...(to && { dateTo: endOfDay(to) }) };
  if (!isSearchQuery(q)) {
    const res = await listCalls(ctx, {
      starred: f.starred,
      tagIds: [...f.tags, ...f.intents.map(intentTagId)],
      ...dates,
      cursor,
      limit: PAGE,
    });
    return {
      items: res.items.map((r) => ({
        ...r,
        snippet: null,
        snippetLang: null,
        snippetTranslated: false,
        snippetOrd: null,
        highlights: [],
      })),
      nextCursor: res.nextCursor,
      alsoMatched: [],
      forms: [],
      vector: null,
    };
  }
  const res = await searchCalls(ctx, {
    text: q.text,
    contacts: [...f.contacts, ...f.numbers],
    tagIds: f.tags,
    intents: f.intents,
    starred: f.starred,
    ...dates,
    semantic: f.match === 'meaning',
    exclude: q.excluded,
    limit: PAGE,
    cursor,
  });
  return {
    items: res.items.map((r) => ({
      id: r.id,
      day: r.day,
      durationBucket: r.durationBucket,
      tags: r.tags,
      tagToks: r.tagToks,
      starred: r.starred,
      hasRecording: r.hasRecording,
      meta: () => Promise.resolve(r.meta),
      snippet: r.snippet,
      snippetLang: r.snippetLang,
      snippetTranslated: r.snippetTranslated,
      snippetOrd: r.snippetOrd,
      highlights: r.highlights,
    })),
    nextCursor: res.nextCursor,
    alsoMatched: res.alsoMatched,
    forms: res.forms,
    vector: res.vector,
  };
}

type State = {
  status: 'loading' | 'error' | 'ready';
  error: unknown;
  raw: FeedItem[];
  cursor: string | null;
  alsoMatched: string[];
  forms: string[];
  mode: 'list' | 'search';
};

const INITIAL: State = {
  status: 'loading',
  error: null,
  raw: [],
  cursor: null,
  alsoMatched: [],
  forms: [],
  mode: 'list',
};

/**
 * The calls list and search results behind the sentence filters: pages from the server, then
 * direction (encrypted, so on the device) and the sort.
 */
export function useCallFeed(ctx: ClientContext, query: FeedQuery, hidden: ReadonlySet<string>) {
  const [state, setState] = useState<State>(INITIAL);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [metaVersion, setMetaVersion] = useState(0);
  const metas = useRef(new Map<string, CallMeta>());
  const run = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const stateRef = useRef(state);
  stateRef.current = state;

  useLockWipe(() => {
    run.current++;
    metas.current = new Map();
    setState(INITIAL);
  });

  const noteMeta = useCallback((id: string, meta: CallMeta) => {
    if (metas.current.get(id) === meta) return;
    metas.current.set(id, meta);
    setMetaVersion((v) => v + 1);
  }, []);

  const decryptAll = useCallback(async (items: FeedItem[]) => {
    const pairs = await Promise.all(items.map(async (i) => [i.id, await i.meta()] as const));
    for (const [id, m] of pairs) metas.current.set(id, m);
    setMetaVersion((v) => v + 1);
  }, []);

  /** Fetches from `cursor` until the query's needs are met: a full sort, or enough rows. */
  const fetchMore = useCallback(
    async (q: FeedQuery, cursor: string | null, id: number) => {
      const f = q.filters;
      const needAll = f.sort === 'oldest' || f.sort === 'longest';
      const out: Page = {
        items: [],
        nextCursor: cursor,
        alsoMatched: [],
        forms: [],
        vector: null,
      };
      for (let page = 0; page < MAX_PAGES; page++) {
        const p = await fetchPage(ctx, q, out.nextCursor);
        if (id !== run.current) return null;
        if (page === 0) {
          out.alsoMatched = p.alsoMatched;
          out.forms = p.forms;
          out.vector = p.vector;
        }
        out.items.push(...p.items);
        out.nextCursor = p.nextCursor;
        if (f.direction !== 'all' || needAll) await decryptAll(p.items);
        if (!out.nextCursor || needAll) {
          if (!out.nextCursor) break;
          continue;
        }
        const shown = filterByDirection(out.items, (i) => metas.current.get(i.id), f.direction);
        if (shown.length >= MIN_VISIBLE || f.direction === 'all') break;
      }
      return out;
    },
    [ctx, decryptAll],
  );

  /** On a meaning search, marks the phrase of each snippet closest to the query. */
  const markMeaning = useCallback(
    (p: Page, id: number) => {
      if (!p.vector) return;
      meaningHighlights(
        ctx.embedder,
        p.vector,
        p.items.map((i) => i.snippet),
      ).then(
        (ranges) => {
          if (id !== run.current) return;
          const byId = new Map(p.items.map((item, k) => [item.id, ranges[k]] as const));
          setState((s) => ({
            ...s,
            raw: s.raw.map((i) => {
              const r = byId.get(i.id);
              return r ? { ...i, highlights: [...i.highlights, r] } : i;
            }),
          }));
        },
        () => {},
      );
    },
    [ctx],
  );

  const key = JSON.stringify(query);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands for the query
  useEffect(() => {
    const id = ++run.current;
    const q = queryRef.current;
    if (stateRef.current.status === 'ready') setRefreshing(true);
    else setState((s) => ({ ...s, status: 'loading' }));
    fetchMore(q, null, id).then(
      (p) => {
        if (!p) return;
        setRefreshing(false);
        setState({
          status: 'ready',
          error: null,
          raw: p.items,
          cursor: p.nextCursor,
          alsoMatched: p.alsoMatched,
          forms: p.forms,
          mode: isSearchQuery(q) ? 'search' : 'list',
        });
        markMeaning(p, id);
      },
      (error: unknown) => {
        if (id !== run.current) return;
        setRefreshing(false);
        setState({ ...INITIAL, status: 'error', error });
      },
    );
  }, [key, attempt, fetchMore, markMeaning]);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (s.status !== 'ready' || !s.cursor || loadingMore) return;
    const id = run.current;
    setLoadingMore(true);
    fetchMore(queryRef.current, s.cursor, id).then(
      (p) => {
        setLoadingMore(false);
        if (!p) return;
        const known = new Set(stateRef.current.raw.map((i) => i.id));
        setState((st) => ({
          ...st,
          raw: [...st.raw, ...p.items.filter((i) => !known.has(i.id))],
          cursor: p.nextCursor,
        }));
        markMeaning(p, id);
      },
      () => setLoadingMore(false),
    );
  }, [fetchMore, loadingMore, markMeaning]);

  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  const patch = useCallback<Feed['patch']>((id, change) => {
    setState((s) => ({ ...s, raw: s.raw.map((i) => (i.id === id ? { ...i, ...change } : i)) }));
  }, []);

  const { direction, sort } = query.filters;
  // biome-ignore lint/correctness/useExhaustiveDependencies: metaVersion tracks the metas map
  const items = useMemo(() => {
    const visible = filterByDirection(
      state.raw.filter((i) => !hidden.has(i.id)),
      (i) => metas.current.get(i.id),
      direction,
    );
    const at = (i: FeedItem) => metas.current.get(i.id)?.startedAt ?? '';
    const byDate = (a: FeedItem, b: FeedItem) => a.day - b.day || at(a).localeCompare(at(b));
    if (sort === 'oldest') return visible.sort(byDate);
    if (sort === 'longest') {
      const len = (i: FeedItem) => metas.current.get(i.id)?.durationSec ?? i.durationBucket * 60;
      return visible.sort((a, b) => len(b) - len(a));
    }
    return visible;
  }, [state.raw, hidden, direction, sort, metaVersion]);

  return {
    status: state.status,
    error: state.error,
    refreshing,
    items,
    hasMore: state.cursor !== null,
    loadingMore,
    loadMore,
    reload,
    mode: state.mode,
    alsoMatched: state.alsoMatched,
    forms: state.forms,
    metas: metas.current,
    metaVersion,
    noteMeta,
    patch,
  } satisfies Feed;
}
