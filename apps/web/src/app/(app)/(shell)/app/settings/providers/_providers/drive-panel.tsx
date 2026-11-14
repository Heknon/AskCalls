'use client';

import type { RecordingStoreInfo } from '@askcalls/client-core/ports/index';
import { forgetStore, switchRecordings } from '@askcalls/client-core/recording-stores/choice';
import {
  moveRecordings,
  type StoredRecording,
  storedRecordings,
} from '@askcalls/client-core/recording-stores/move';
import { driveRef } from '@askcalls/client-core/recording-stores/refs';
import { type Providers, randomId } from '@askcalls/client-core/userdata';
import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { JobProgress } from '@askcalls/ui/components/JobProgress';
import { TestConnectionResult } from '@askcalls/ui/components/TestConnectionResult';
import { UsageMeter } from '@askcalls/ui/components/UsageMeter';
import { Button } from '@askcalls/ui/primitives/button';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { connectDrivePopup } from '../../../../../../../client/drive-connect';
import { useAppSession, useUnlocked } from '../../../../../../../client/session/session';
import { intlLocale } from '../../../../../../../i18n/locales';
import type { TestOutcome } from './connection-test';
import { testDetail } from './key-card';
import { useSaveProviders } from './save';

const DRIVE_HOST = 'www.googleapis.com';
const GB = 1e9;

type ConnectError = 'denied' | 'scope' | 'failed' | 'popup';

/** Settings → Providers → Recording backups → Google Drive. */
export function DrivePanel({
  doc,
  onSaved,
}: {
  doc: Providers;
  onSaved: (doc: Providers) => void;
}) {
  const connected = doc.recordings.mode === 'drive' ? doc.recordings.drive : null;
  return connected ? (
    <Connected drive={connected} onSaved={onSaved} />
  ) : (
    <Connect onSaved={onSaved} />
  );
}

function Connect({ onSaved }: { onSaved: (doc: Providers) => void }) {
  const t = useTranslations('settings.prov.drive');
  const { client } = useUnlocked();
  const save = useSaveProviders();
  const [state, setState] = useState<'idle' | 'connecting' | { error: ConnectError }>('idle');

  const connect = async () => {
    const pending = connectDrivePopup('backup');
    if (!pending) return setState({ error: 'popup' });
    setState('connecting');
    const m = await pending;
    if (!m) return setState('idle');
    if (!m.ok) return setState({ error: m.error });
    if (!m.refreshToken) return setState({ error: 'failed' });
    try {
      const drive = { id: randomId(), refreshToken: m.refreshToken, folderId: null };
      (await client.ownStores.drive()).seedToken(m.refreshToken, m);
      const r = await save((p) => switchRecordings(p, { mode: 'drive', drive }));
      if (!r.reloading) onSaved(r.doc);
    } catch {
      setState({ error: 'failed' });
    }
  };

  const error = typeof state === 'object' ? state.error : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" loading={state === 'connecting'} onClick={connect}>
          {state === 'connecting' ? t('connecting') : t('connect')}
        </Button>
        {state === 'connecting' ? (
          <span className="text-muted-foreground text-sm">{t('finishInPopup')}</span>
        ) : null}
      </div>
      {error ? <ErrorState scope="inline" title={t(`error.${error}`)} /> : null}
    </div>
  );
}

function Connected({
  drive,
  onSaved,
}: {
  drive: Extract<Providers['recordings'], { mode: 'drive' }>['drive'];
  onSaved: (doc: Providers) => void;
}) {
  const t = useTranslations('settings.prov.drive');
  const tp = useTranslations('settings.prov');
  const tc = useTranslations('common');
  const locale = intlLocale(useLocale());
  const { client, ctx } = useUnlocked();
  const { refreshMe } = useAppSession();
  const save = useSaveProviders();
  const ref = driveRef(drive);
  const [info, setInfo] = useState<RecordingStoreInfo | 'failed' | null>(null);
  const [test, setTest] = useState<
    { state: 'idle' | 'testing' } | { state: 'done'; outcome: TestOutcome }
  >({ state: 'idle' });
  const [confirm, setConfirm] = useState<StoredRecording[] | null>(null);
  const [moving, setMoving] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<number | 'disconnect' | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    client.ownStores.describe(ref).then(
      (i) => alive.current && setInfo(i),
      () => alive.current && setInfo('failed'),
    );
    return () => {
      alive.current = false;
    };
  }, [client, ref]);

  const runTest = async () => {
    setTest({ state: 'testing' });
    const started = performance.now();
    const r = await client.ownStores.probe(ref);
    const outcome: TestOutcome = r.ok
      ? { ok: true, ms: performance.now() - started }
      : r.reason === 'unauthorized'
        ? { ok: false, reason: 'key', ...(r.status && { status: r.status }) }
        : r.reason === 'cors_or_network'
          ? { ok: false, reason: 'unreachable' }
          : { ok: false, reason: 'http', ...(r.status && { status: r.status }) };
    setTest({ state: 'done', outcome });
  };

  const askDisconnect = async () => {
    setFailed(null);
    const all = await storedRecordings(ctx).catch(() => null);
    if (!all) return setFailed('disconnect');
    setConfirm(all.filter((r) => r.bucketRef === ref));
  };

  const disconnect = async (inDrive: StoredRecording[]) => {
    setConfirm(null);
    if (inDrive.length > 0) {
      setMoving({ done: 0, total: inDrive.length });
      const r = await moveRecordings(ctx, null, inDrive, {
        onProgress: (done) => setMoving({ done, total: inDrive.length }),
      });
      setMoving(null);
      void refreshMe().catch(() => {});
      if (r.failed > 0) return setFailed(r.failed);
    }
    try {
      await client.ownStores.revokeDrive(drive.refreshToken).catch(() => {});
      const r = await save((p) => forgetStore(p, ref));
      if (!r.reloading) onSaved(r.doc);
    } catch {
      setFailed('disconnect');
    }
  };

  const detail =
    test.state === 'done'
      ? test.outcome.ok
        ? t('testOk')
        : test.outcome.reason === 'key'
          ? t('revoked')
          : testDetail(tp, test.outcome, '', DRIVE_HOST, tp('choice.drive'))
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      {info && info !== 'failed' ? (
        <div className="flex flex-col gap-3">
          {info.account && info.location ? (
            <p className="text-sm">
              {t.rich('where', {
                folder: info.location ?? '',
                email: info.account,
                b: (chunks) => (
                  <bdi dir="ltr" className="font-medium">
                    {chunks}
                  </bdi>
                ),
              })}
            </p>
          ) : null}
          {info.usedBytes !== null && info.limitBytes !== null ? (
            <UsageMeter
              label={t('space')}
              used={Number((info.usedBytes / GB).toFixed(1))}
              limit={Number((info.limitBytes / GB).toFixed(0))}
              unit="GB"
              locale={locale}
            />
          ) : info.usedBytes !== null ? (
            <p className="text-muted-foreground text-sm">
              {t('spaceUnlimited', { used: Number((info.usedBytes / GB).toFixed(1)) })}
            </p>
          ) : null}
        </div>
      ) : null}
      {info === 'failed' ? <ErrorState scope="inline" title={t('describeFailed')} /> : null}

      <TestConnectionResult
        state={test.state === 'done' ? (test.outcome.ok ? 'ok' : 'failed') : test.state}
        detail={detail}
        onTest={runTest}
        labels={{ test: tp('test'), testing: tp('testing') }}
      />

      {moving ? (
        <>
          <JobProgress
            done={moving.done}
            total={moving.total}
            label={t('moving', moving)}
            labels={{ pause: '', resume: '', stop: '', progress: t('moving', moving) }}
          />
          <p className="text-muted-foreground text-sm">{tp('move.keepOpen')}</p>
        </>
      ) : (
        <div>
          <Button variant="outline" onClick={askDisconnect}>
            {t('disconnect')}
          </Button>
        </div>
      )}
      {failed === 'disconnect' ? (
        <ErrorState scope="inline" title={t('disconnectFailed')} />
      ) : failed ? (
        <ErrorState scope="inline" title={tp('move.failed', { count: failed })} />
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('disconnectTitle')}
        description={
          confirm && confirm.length > 0
            ? t('disconnectMove', { count: confirm.length })
            : t('disconnectBody')
        }
        confirmLabel={confirm && confirm.length > 0 ? t('moveAndDisconnect') : t('disconnect')}
        cancelLabel={tc('cancel')}
        onConfirm={() => confirm && void disconnect(confirm)}
      />
    </div>
  );
}
