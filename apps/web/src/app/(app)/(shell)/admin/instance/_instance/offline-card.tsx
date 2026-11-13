'use client';

import { ApiError } from '@askcalls/api-contract';
import { fixOfflineBlocker, updateInstance } from '@askcalls/api-contract/routes/admin';
import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { OfflineBlockerList } from '@askcalls/ui/components/OfflineBlockerList';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useInstance } from './form';

const SIGN_IN = new Set(['sign-in-google', 'sign-in-github', 'sign-in-email']);

/** A2: the offline switch with every setting that would reach the internet and its fixes. */
export function OfflineCard() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const tp = useTranslations('admin.provider');
  const { view, api, apply } = useInstance();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { enabled, blockers } = view.offline;

  const run = async (fn: () => Promise<typeof view>) => {
    setError(null);
    try {
      apply(await fn());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };
  const setOffline = (on: boolean) =>
    run(() => api.request(updateInstance, { body: { patch: { offlineMode: on } } }));
  const adapterName = (a: string) =>
    ['google', 'github', 'email', 'local', 's3', 'postgres', 'redirect-proxy'].includes(a) ||
    a.startsWith('otel')
      ? a
      : tp(a as 'none');

  return (
    <div className="flex flex-col gap-2 md:col-span-2" data-offline={enabled ? 'on' : 'off'}>
      <OfflineBlockerList
        title={t('offline.title')}
        summary={
          enabled
            ? t('offline.on')
            : blockers.length
              ? t('offline.blockers', { n: blockers.length })
              : t('offline.clear')
        }
        enabled={enabled}
        onEnabledChange={(on) => (on ? setConfirm(true) : void setOffline(false))}
        blockers={blockers.map((b) => ({
          key: b.id,
          what: t(`offline.what.${b.id}` as 'offline.what.llm', {
            adapter: adapterName(b.adapter),
          }),
          host: b.host,
          fixes: b.fixes.map((fix) => ({
            label: t(
              `offline.fix.${fix === 'off' && SIGN_IN.has(b.id) ? b.id : fix}` as 'offline.fix.off',
            ),
            onFix: () =>
              void run(() => api.request(fixOfflineBlocker, { body: { blocker: b.id, fix } })),
          })),
        }))}
      />
      {blockers.some((b) => b.id === 'database') ? (
        <p className="text-muted-foreground text-sm">{t('offline.databaseHint')}</p>
      ) : null}
      {error ? <ErrorState scope="inline" title={t('saveFailed', { reason: error })} /> : null}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t('offline.confirmTitle')}
        description={t('offline.confirm')}
        confirmLabel={t('offline.confirmLabel')}
        cancelLabel={tc('cancel')}
        onConfirm={() => void setOffline(true)}
      />
    </div>
  );
}
