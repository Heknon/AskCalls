'use client';

import type { DecryptedCall } from '@askcalls/client-core/calls';
import { highlightRanges, locateChunk } from '@askcalls/client-core/search';
import type { TranscriptSegment } from '@askcalls/domain';
import { useMediaQuery } from '@askcalls/ui/lib/use-media-query';
import { useCallback, useMemo, useState } from 'react';

/** `original` or the ISO 639-1 code of a translation. */
export type TranscriptView = string;
export const ORIGINAL = 'original';

const VIEW_KEY = 'askcalls:transcript-view';
const COLUMNS_KEY = 'askcalls:transcript-columns';
/** Side by side needs room for two readable columns next to the panel. */
export const WIDE_QUERY = '(min-width: 80rem)';

/** A per-viewer convenience: the language last picked. Storage may be unavailable. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private windows and blocked storage: the choice lasts for this page only.
  }
}

export interface MatchedPassage {
  lang: string | null;
  translated: boolean;
  ord: number | null;
}

export interface Column {
  view: TranscriptView;
  /** The language shown: the original's or the translation's. */
  lang: string | null;
  segments: readonly TranscriptSegment[];
  hits: string[][];
}

/**
 * Which language the call view shows: the search's matched passage first (meaning search), else
 * the language whose words matched (keyword search), else the viewer's last choice. Side by
 * side pairs the original with the chosen translation on wide screens.
 */
export function useTranscriptView(
  call: DecryptedCall,
  forms: readonly string[],
  matched: MatchedPassage | undefined,
  contactNames: readonly string[],
) {
  const language = call.meta.language;
  const translations = call.transcript.translations ?? {};
  const langs = useMemo(() => Object.keys(translations).sort(), [translations]);
  const versionOf = useCallback(
    (view: TranscriptView) =>
      view === ORIGINAL || !translations[view]
        ? { lang: language, segments: call.transcript.segments }
        : { lang: view, segments: translations[view]!.segments },
    [call.transcript.segments, language, translations],
  );

  const hitsFor = useMemo(() => {
    const set = new Set(forms);
    return (segments: readonly TranscriptSegment[]) =>
      segments.map((s) => highlightRanges(s.text, set).map((r) => s.text.slice(r.start, r.end)));
  }, [forms]);

  const [start] = useState(() => {
    if (matched?.ord != null) {
      const at = locateChunk(call.transcript, language, matched.ord, contactNames);
      if (at) return { view: at.translated && at.lang ? at.lang : ORIGINAL, segment: at.segment };
    }
    if (forms.length) {
      for (const view of [ORIGINAL, ...langs]) {
        const hits = hitsFor(versionOf(view).segments);
        const first = hits.findIndex((h) => h.length > 0);
        if (first >= 0) return { view, segment: first };
      }
    }
    const saved = read(VIEW_KEY);
    const view = saved && (langs.includes(saved) ? saved : ORIGINAL);
    return { view: view ?? ORIGINAL, segment: null as number | null };
  });
  const [view, setViewState] = useState<TranscriptView>(start.view);
  const [columns, setColumnsState] = useState(() => read(COLUMNS_KEY) === '2');
  const wide = useMediaQuery(WIDE_QUERY);
  const sideBySide = columns && wide && langs.length > 0;

  const setView = (v: TranscriptView) => {
    setViewState(v);
    write(VIEW_KEY, v === ORIGINAL ? ORIGINAL : v);
  };
  const setColumns = (on: boolean) => {
    setColumnsState(on);
    write(COLUMNS_KEY, on ? '2' : '1');
  };

  const shown: Column[] = useMemo(() => {
    const views = sideBySide
      ? [ORIGINAL, view === ORIGINAL ? langs[0]! : view]
      : [view === ORIGINAL || langs.includes(view) ? view : ORIGINAL];
    return views.map((v) => {
      const { lang, segments } = versionOf(v);
      return { view: v, lang, segments, hits: hitsFor(segments) };
    });
  }, [sideBySide, view, langs, versionOf, hitsFor]);

  return {
    langs,
    view,
    setView,
    columns,
    setColumns,
    wide,
    sideBySide,
    shown,
    /** The segment the search pointed at, to scroll to once. */
    startSegment: start.segment,
  };
}
