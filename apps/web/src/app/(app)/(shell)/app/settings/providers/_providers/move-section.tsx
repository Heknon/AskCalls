'use client';

import {
  movable,
  moveRecordings,
  type StoredRecording,
  storedRecordings,
} from '@askcalls/client-core/recording-stores/move';
import { isDriveRef } from '@askcalls/client-core/recording-stores/refs';
import type { Providers } from '@askcalls/client-core/userdata';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { JobProgress } from '@askcalls/ui/components/JobProgress';
import { Button } from '@askcalls/ui/primitives/button';
import { FileAudio } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useNotify } from '../../../../../../../client/notices/notices';
import { useAppSession, useUnlocked } from '../../../../../../../client/session/session';

type Place = 'managed' | 'bucket' | 'drive';
const placeOf = (ref: string | null): Place =>
  ref === null ? 'managed' : isDriveRef(ref) ? 'drive' : 'bucket';

/** Offers to move recordings from any other store into `target`, on this device. */
export function MoveRecordings({
  doc,
  target,
}: {
  doc: Providers;
  /** Null: the instance bucket. */
  target: string | null;
}) {
  const t = useTranslations('settings.prov.move');
  const { ctx } = useUnlocked();
  const { refreshMe } = useAppSession();
  const notify = useNotify();
  const [items, setItems] = useState<StoredRecording[] | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [failed, setFailed] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const scan = async () => movable(docRef.current, await storedRecordings(ctx), target);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rescans only when the target changes
  useEffect(() => {
    let cancelled = false;
    scan().then(
      (x) => !cancelled && setItems(x),
      () => !cancelled && setItems([]),
    );
    return () => {
      cancelled = true;
      abort.current?.abort();
    };
  }, [ctx, target]);

  if (!items || items.length === 0) return null;

  const places = new Set(items.map((r) => placeOf(r.bucketRef)));
  const from = places.size === 1 ? [...places][0]! : 'mixed';
  const to = placeOf(target);

  const start = async () => {
    abort.current = new AbortController();
    setDone(0);
    setFailed(0);
    const r = await moveRecordings(ctx, target, items, {
      onProgress: setDone,
      signal: abort.current.signal,
    });
    setDone(null);
    setFailed(r.failed);
    if (r.moved > 0) {
      notify({ kind: 'event', icon: FileAudio, title: t('done', { count: r.moved }) });
    }
    void refreshMe().catch(() => {});
    setItems(await scan().catch(() => []));
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <p className="font-medium">{t('title')}</p>
      <p className="text-muted-foreground text-sm">
        {t('body', { count: items.length, from: t(`from.${from}`), to: t(`to.${to}`) })}
      </p>
      {done !== null ? (
        <>
          <JobProgress
            done={done}
            total={items.length}
            label={t('progress', { done, total: items.length })}
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
        <div>
          <Button variant="outline" onClick={start}>
            {t('start')}
          </Button>
        </div>
      )}
      {failed > 0 ? <ErrorState scope="inline" title={t('failed', { count: failed })} /> : null}
    </div>
  );
}
