import { search as searchRoute } from '@askcalls/api-contract/routes/search';
import { token, tokenSet } from '@askcalls/crypto';
import { type CallMeta, type DurationBucket, dayFromDate, type Transcript } from '@askcalls/domain';
import {
  buildSynonymLookup,
  DEFAULT_PHONE_REGION,
  isPhoneRegion,
  normalizeWord,
  parsePhone,
  prepareQuery,
  wordForms,
} from '@askcalls/indexing';
import { decryptMeta, decryptSnippet, openDek } from './call-crypto';
import type { ClientContext } from './context';
import { intentTagId, type ResolvedTag, STAR_TAG_ID } from './tags';

export interface SearchRequest {
  /** The search box text; plain words search keywords with fuzzy expansion. */
  text?: string;
  /** Contact chip: phone numbers in any format, or contact ids from the contact list. */
  contacts?: readonly string[];
  /** Tag chip: catalog tag ids, all required. */
  tagIds?: readonly string[];
  excludeTagIds?: readonly string[];
  /** Intent chip: intent ids, all required. */
  intents?: readonly string[];
  starred?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  /** Meaning chip: rank by the query embedding instead of filtering by keywords. */
  semantic?: boolean;
  /** Variants the user removed from "also matched"; they are not searched. */
  exclude?: readonly string[];
  limit?: number;
  cursor?: string | null;
}

export interface HighlightRange {
  start: number;
  end: number;
}

export interface SearchResultItem {
  id: string;
  day: number;
  durationBucket: DurationBucket;
  meta: CallMeta;
  tags: ResolvedTag[];
  tagToks: readonly bigint[];
  starred: boolean;
  hasRecording: boolean;
  snippet: string | null;
  /**
   * Language of the snippet: the chunk that matched best, from the original or a translation.
   * Null when there is no snippet or the chunk predates translations.
   */
  snippetLang: string | null;
  /** True when the snippet comes from a translation rather than the original. */
  snippetTranslated: boolean;
  /** The matched chunk's ord, for `locateChunk` in the call view. */
  snippetOrd: number | null;
  /** Ranges in `snippet` (UTF-16 offsets) whose word matches a searched form. */
  highlights: HighlightRange[];
  score: number | null;
}

export interface SearchResponse {
  items: SearchResultItem[];
  nextCursor: string | null;
  /** Fuzzy and prefix variants that were searched ("also matched: …"). */
  alsoMatched: string[];
  /** Words dropped as stopwords. */
  ignored: string[];
  /** Every word form searched, for highlighting the same words in a decrypted transcript. */
  forms: string[];
  /** The query's embedding on a meaning search, for `meaningHighlights`. */
  vector: Float32Array | null;
}

export interface TranscriptPassage {
  /** The original's language or the translation's. */
  lang: string | null;
  translated: boolean;
  segment: number;
  text: string;
  hits: string[];
}

/**
 * The first segment whose words match `forms`, looking in the original and then in each
 * translation, so a keyword result shows the language that matched.
 */
export function findPassage(
  transcript: Transcript,
  language: string | null,
  forms: ReadonlySet<string>,
): TranscriptPassage | null {
  const versions: Array<{
    lang: string | null;
    translated: boolean;
    segments: Transcript['segments'];
  }> = [{ lang: language, translated: false, segments: transcript.segments }];
  for (const [lang, t] of Object.entries(transcript.translations ?? {}).sort()) {
    versions.push({ lang, translated: true, segments: t.segments });
  }
  for (const v of versions) {
    for (let i = 0; i < v.segments.length; i++) {
      const text = v.segments[i]!.text;
      const ranges = highlightRanges(text, forms);
      if (ranges.length) {
        return {
          lang: v.lang,
          translated: v.translated,
          segment: i,
          text,
          hits: ranges.map((r) => text.slice(r.start, r.end)),
        };
      }
    }
  }
  return null;
}

/** `POST /api/search` accepts at most 32 terms. */
const MAX_KEYWORD_GROUPS = 32;

const WORD = /[\p{L}\p{M}\p{N}'״]+/gu;

/** Ranges of `text` whose words share a normal form with `forms`. */
export function highlightRanges(text: string, forms: ReadonlySet<string>): HighlightRange[] {
  if (forms.size === 0) return [];
  const out: HighlightRange[] = [];
  for (const m of text.matchAll(WORD)) {
    const word = normalizeWord(m[0]);
    if (!word) continue;
    const hit = forms.has(word) || wordForms(word).some((f) => forms.has(f.form));
    if (hit) out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

async function contactTokens(ctx: ClientContext, values: readonly string[], region: string) {
  const r = isPhoneRegion(region) ? region : DEFAULT_PHONE_REGION;
  const { contacts } = await ctx.userData.get('contacts');
  const phones = values.flatMap((v) => {
    const contact = contacts.find((c) => c.id === v);
    return contact ? contact.phones : [v];
  });
  const e164 = [...new Set(phones.map((p) => parsePhone(p, r)).filter((p): p is string => !!p))];
  return Promise.all(e164.map((p) => token(ctx.session.keys.indexKey, 'c', p)));
}

/** Search (spec 9.1, 11.2): expand and hash locally, query, decrypt metadata and snippets. */
export async function searchCalls(ctx: ClientContext, req: SearchRequest): Promise<SearchResponse> {
  const { session } = ctx;
  const index = session.keys.indexKey;
  const [settings, synonymsDoc, contactsDoc, directory] = await Promise.all([
    ctx.userData.get('settings'),
    ctx.userData.get('synonyms'),
    ctx.userData.get('contacts'),
    ctx.tagDirectory(),
    ctx.vocabulary.sync(),
  ]);

  const prepared = prepareQuery(req.text ?? '', {
    vocabulary: ctx.vocabulary.vocabulary,
    synonyms: buildSynonymLookup(synonymsDoc.entries),
    includePrefixes: settings.includePrefixes,
    redaction: {
      names: contactsDoc.contacts.map((c) => c.name),
      ...(isPhoneRegion(settings.phoneRegion) && { region: settings.phoneRegion }),
    },
  });
  const semantic = req.semantic === true && prepared.terms.length > 0;
  const excluded = new Set(req.exclude ?? []);
  const groups = prepared.keywordGroups.map((g) => {
    const kept = g.filter((f) => !excluded.has(f));
    return kept.length ? kept : g;
  });
  const keywordGroups = semantic
    ? []
    : await Promise.all(groups.slice(0, MAX_KEYWORD_GROUPS).map((g) => tokenSet(index, 'w', g)));

  const requiredTagIds = [
    ...(req.tagIds ?? []),
    ...(req.intents ?? []).map(intentTagId),
    ...(req.starred ? [STAR_TAG_ID] : []),
  ];
  const starTok = directory.tokenOf(STAR_TAG_ID)!;
  const [tagToks, excludeTagToks, contactToks, vector] = await Promise.all([
    tokenSet(index, 't', requiredTagIds),
    tokenSet(index, 't', req.excludeTagIds ?? []),
    req.contacts?.length
      ? contactTokens(ctx, req.contacts, settings.phoneRegion)
      : Promise.resolve(null),
    semantic
      ? ctx.embedder.embed([prepared.embedText]).then((v) => v[0]!)
      : Promise.resolve(undefined),
  ]);
  // A contact chip that matches no parsable phone can match no call.
  const forms = [...new Set(groups.flat())];
  if (contactToks && contactToks.length === 0) {
    return {
      items: [],
      nextCursor: null,
      alsoMatched: prepared.alsoMatched,
      ignored: prepared.ignored,
      forms,
      vector: vector ?? null,
    };
  }

  const res = await ctx.api.request(searchRoute, {
    body: {
      keywordGroups,
      ...(contactToks && { contactToks }),
      ...(tagToks.length && { tagToks }),
      ...(excludeTagToks.length && { excludeTagToks }),
      ...(req.dateFrom && { dayFrom: dayFromDate(req.dateFrom) }),
      ...(req.dateTo && { dayTo: dayFromDate(req.dateTo) }),
      ...(vector && { vector }),
      limit: req.limit ?? 20,
      cursor: req.cursor ?? null,
      starTok,
    },
  });

  // Meaning hits arrive most similar first, so the first one under the floor ends the results.
  const floor = vector ? ctx.embedder.minSimilarity : undefined;
  const related =
    floor === undefined ? res.items : res.items.filter((h) => h.score !== null && h.score >= floor);
  const nextCursor = related.length < res.items.length ? null : res.nextCursor;

  const formSet = new Set(forms);
  const items = await Promise.all(
    related.map(async (hit): Promise<SearchResultItem> => {
      const keyCtx = { userId: session.userId, callId: hit.id };
      const dek = await openDek(session, hit.id, hit.wrappedDek);
      const [meta, snippet] = await Promise.all([
        decryptMeta(dek, keyCtx, hit.metaCt),
        hit.bestSnippetCt && hit.bestChunkOrd !== null
          ? decryptSnippet(dek, keyCtx, hit.bestChunkOrd, hit.bestSnippetCt)
          : Promise.resolve(null),
      ]);
      return {
        id: hit.id,
        day: hit.day,
        durationBucket: hit.durationBucket,
        meta,
        tags: directory.resolve(hit.tagToks),
        tagToks: hit.tagToks,
        starred: hit.starred ?? directory.isStarred(hit.tagToks),
        hasRecording: hit.hasRecording,
        snippet,
        snippetLang: snippet ? hit.bestChunkLang : null,
        snippetOrd: snippet ? hit.bestChunkOrd : null,
        snippetTranslated:
          snippet !== null && hit.bestChunkLang !== null && hit.bestChunkLang !== meta.language,
        highlights: snippet ? highlightRanges(snippet, formSet) : [],
        score: hit.score,
      };
    }),
  );
  session.touch();
  return {
    items,
    nextCursor,
    alsoMatched: prepared.alsoMatched,
    ignored: prepared.ignored,
    forms,
    vector: vector ?? null,
  };
}
