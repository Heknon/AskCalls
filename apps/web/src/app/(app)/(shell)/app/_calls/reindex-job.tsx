'use client';

import {
  type ReindexMode,
  type ReindexProgress,
  reindexCalls,
  reindexCandidates,
} from '@askcalls/client-core/reindex';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { JobProgress } from '@askcalls/ui/components/JobProgress';
import { Button } from '@askcalls/ui/primitives/button';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useNotify } from '../../../../../client/notices/notices';
import { useAppSession, useUnlocked } from '../../../../../client/session/session';

type Ns = 'settings.prov.backfill' | 'tags.syn.reindex' | 'tags.intents.reindex';

/**
 * A re-index of existing calls on this device (`reindexCalls`): the translation backfill, or
 * applying synonyms or intents to calls already stored. Counts the calls first, then runs a few at a time
 * with progress. Stop finishes the calls in flight; starting again resumes, because calls
 * already done are no longer candidates in `translate` mode.
 */
export function ReindexJob({
  mode,
  ns,
  icon,
  hideWhenNone = true,
}: {
  mode: ReindexMode;
  ns: Ns;
  icon: LucideIcon;
  /** Renders nothing when no call needs it. */
  hideWhenNone?: boolean;
}) {
  const t = useTranslations(ns as 'settings.prov.backfill');
  const { ctx } = useUnlocked();
  const { refreshMe } = useAppSession();
  const notify = useNotify();
  const [count, setCount] = useState<number | null>(null);
  const [progress, setProgress] = useState<ReindexProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReindexProgress | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    reindexCandidates(ctx, mode).then(
      (ids) => !cancelled && setCount(ids.length),
      () => !cancelled && setCount(0),
    );
    return () => {
      cancelled = true;
      abort.current?.abort();
    };
  }, [ctx, mode]);

  if (count === null || (hideWhenNone && count === 0 && !result && !running)) return null;

  const start = async () => {
    abort.current = new AbortController();
    setRunning(true);
    setResult(null);
    try {
      const r = await reindexCalls(ctx, {
        mode,
        signal: abort.current.signal,
        onProgress: setProgress,
      });
      setResult(r);
      if (r.reindexed > 0) {
        notify({ kind: 'event', icon, title: t('done', { count: r.reindexed }) });
      }
    } catch {
      setResult({ done: 0, total: count, reindexed: 0, untranslated: 0, failed: count });
    } finally {
      setRunning(false);
      setProgress(null);
      void refreshMe().catch(() => {});
      if (mode === 'translate') {
        setCount(
          await reindexCandidates(ctx, mode).then(
            (x) => x.length,
            () => 0,
          ),
        );
      }
    }
  };

  const stopped = result !== null && result.done < result.total;
  return (
    <div
      data-component="ReindexJob"
      data-mode={mode}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <p className="font-medium">{t('title')}</p>
      {count > 0 || running ? (
        <p className="text-muted-foreground text-sm">{t('body', { count })}</p>
      ) : null}
      {running && progress ? (
        <>
          <JobProgress
            done={progress.done}
            total={progress.total}
            label={t('progress', { done: progress.done, total: progress.total })}
            onStop={() => abort.current?.abort()}
            labels={{
              pause: t('pause'),
              resume: t('resume'),
              stop: t('stop'),
              progress: t('progressLabel'),
            }}
          />
          <p className="text-muted-foreground text-sm">{t('keepOpen')}</p>
        </>
      ) : (
        <>
          {stopped ? (
            <p className="text-sm">{t('stopped', { done: result.done, total: result.total })}</p>
          ) : null}
          {count > 0 && !running ? (
            <div>
              <Button variant="outline" onClick={start}>
                {stopped ? t('resume') : t('start')}
              </Button>
            </div>
          ) : null}
        </>
      )}
      {result && result.untranslated > 0 && mode === 'translate' ? (
        <ErrorState scope="inline" title={t('untranslated', { count: result.untranslated })} />
      ) : null}
      {result && result.failed > 0 ? (
        <ErrorState scope="inline" title={t('failed', { count: result.failed })} />
      ) : null}
    </div>
  );
}
