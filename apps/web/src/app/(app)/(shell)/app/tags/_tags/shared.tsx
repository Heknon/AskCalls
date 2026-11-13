'use client';

import { listCalls } from '@askcalls/client-core/calls';
import type { ClientContext } from '@askcalls/client-core/context';
import { SaveStatus } from '@askcalls/ui/components/SaveStatus';
import { TAG_COLOURS, type TagColour } from '@askcalls/ui/lib/tag-colour';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

export const colourOf = (c: string | null | undefined): TagColour =>
  (TAG_COLOURS as readonly string[]).includes(c ?? '') ? (c as TagColour) : 'gray';

/** Calls per tag and intent id, counted from tag tokens; nothing is decrypted but the catalog. */
export async function tagCounts(ctx: ClientContext): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let cursor: string | null = null;
  do {
    const page = await listCalls(ctx, { limit: 100, cursor });
    for (const row of page.items) {
      for (const t of row.tags) {
        if (t.kind === 'star') continue;
        counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
      }
    }
    cursor = page.nextCursor;
  } while (cursor);
  return counts;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Runs saves one at a time and reports them through one `SaveStatus`. */
export function useSaver() {
  const [state, setState] = useState<SaveState>('idle');
  const last = useRef<(() => Promise<unknown>) | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const run = useCallback(<T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    last.current = fn;
    setState('saving');
    const next = chain.current.then(fn).then(
      (v) => {
        setState('saved');
        return v;
      },
      () => {
        setState('error');
        return undefined;
      },
    );
    chain.current = next;
    return next;
  }, []);
  const retry = useCallback(() => {
    if (last.current) void run(last.current);
  }, [run]);
  return { state, run, retry };
}

export function SaveIndicator({ saver }: { saver: ReturnType<typeof useSaver> }) {
  const t = useTranslations('tags.save');
  if (saver.state === 'idle') return null;
  return (
    <SaveStatus
      state={saver.state}
      labels={{ saving: t('saving'), saved: t('saved'), error: t('error'), retry: t('retry') }}
      onRetry={saver.retry}
    />
  );
}
