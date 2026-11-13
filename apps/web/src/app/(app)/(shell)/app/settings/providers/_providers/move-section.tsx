'use client';

import {
  movable,
  moveRecordings,
  type StoredRecording,
  storedRecordings,
} from '@askcalls/client-core/recording-stores/move';
import { driveRef, forgetStore, isDriveRef } from '@askcalls/client-core/recording-stores/refs';
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

/**
 * Stores switched away from that no recording uses any more: forgotten, and a Drive grant
 * revoked, so the device keeps no credentials it doesn't need.
 */
export async function pruneStores(
  client: ReturnType<typeof useUnlocked>['client'],
  doc: Providers,
  recordings: readonly StoredRecording[],
): Promise<Providers> {
  const used = new Set(recordings.map((r) => r.bucketRef));
  const unused = [
    ...doc.previousStores.buckets.map((b) => b.id),
    ...doc.previousStores.drives.map(driveRef),
  ].filter((ref) => !used.has(ref));
  if (unused.length === 0) return doc;
  for (const d of doc.previousStores.drives) {
    if (unused.includes(driveRef(d))) {
      const { revokeDrive } = await import('@askcalls/client-core/recording-stores/google-drive');
      await revokeDrive(client.api, d.refreshToken).catch(() => {});
    }
  }
  const next = await client.ctx.userData.update('providers', (p) => unused.reduce(forgetStore, p));
  await client.syncDirectAccess().catch(() => {});
  return next;
}

/** Offers to move recordings from any other store into `target`, on this device. */
export function MoveRecordings({
  doc,
  target,
  onSaved,
}: {
  doc: Providers;
  /** Null: the instance bucket. */
  target: string | null;
  onSaved: (doc: Providers) => void;
}) {
  const t = useTranslations('settings.prov.move');
  const { ctx, client } = useUnlocked();
  const { refreshMe } = useAppSession();
  const notify = useNotify();
  const [items, setItems] = useState<StoredRecording[] | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [failed, setFailed] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const scan = async () => {
    const all = await storedRecordings(ctx);
    const pruned = await pruneStores(client, docRef.current, all).catch(() => docRef.current);
    if (pruned !== docRef.current) onSaved(pruned);
    return movable(pruned, all, target);
  };

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
