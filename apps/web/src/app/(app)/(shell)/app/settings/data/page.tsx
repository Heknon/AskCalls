'use client';

import { deleteAccount } from '@askcalls/api-contract/routes/account';
import { exportAll } from '@askcalls/client-core/export';
import { isDriveRef, knownStores } from '@askcalls/client-core/recording-stores/refs';
import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { JobProgress } from '@askcalls/ui/components/JobProgress';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { Button } from '@askcalls/ui/primitives/button';
import { Download, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useNotify } from '../../../../../../client/notices/notices';
import { useAppSession, useUnlocked } from '../../../../../../client/session/session';
import { useAsync } from '../../../_shell/states';
import { SectionScreen } from '../_settings/section-screen';

const ACCOUNT_CONFIRM = 'delete my account' as const;

function saveFile(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** S8 Export everything (decrypted on this device into a ZIP). */
function ExportSection() {
  const t = useTranslations('settings.data');
  const { ctx, me } = useUnlocked();
  const notify = useNotify();
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const total = me.usage.calls;

  const run = async () => {
    setProgress(0);
    setFailed(false);
    try {
      const zip = await exportAll(ctx, { includeRecordings: true, onProgress: setProgress });
      const now = new Date();
      const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
      saveFile(zip, t('fileName', { date: today.toISOString().slice(0, 10) }));
      notify({ kind: 'event', icon: Download, title: t('exported') });
    } catch {
      setFailed(true);
    } finally {
      setProgress(null);
    }
  };

  return (
    <SettingsSection title={t('export')} description={t('exportBody')}>
      <div className="flex flex-col gap-3 py-3">
        {progress !== null ? (
          <JobProgress
            done={progress}
            total={Math.max(total, progress)}
            label={t('exporting', { done: progress, total: Math.max(total, progress) })}
            labels={{ pause: '', resume: '', stop: '', progress: t('exportLabel') }}
          />
        ) : null}
        {failed ? <ErrorState scope="inline" title={t('exportFailed')} /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" loading={progress !== null} onClick={run}>
            {progress === null ? <Download className="size-4" aria-hidden /> : null}
            {t('exportAction')}
          </Button>
          <span className="text-muted-foreground text-sm">{t('hint')}</span>
        </div>
      </div>
    </SettingsSection>
  );
}

/**
 * S8 Delete account: crypto-shred on the server, then this device deletes the recordings in
 * the user's own bucket (the server has no credentials for it), then signs out.
 */
function DeleteSection() {
  const t = useTranslations('settings.data');
  const tc = useTranslations('common');
  const { ctx, me, client } = useUnlocked();
  const { signOut } = useAppSession();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const email = me.user.email ?? ACCOUNT_CONFIRM;
  const ownBucket = useAsync(
    () => ctx.userData.get('providers').then((p) => knownStores(p).length > 0),
    [ctx],
  );

  const run = async () => {
    setFailed(false);
    setDeleting({ done: 0, total: 0 });
    // Read the stores and fetch Drive access tokens now: once the account is gone, neither the
    // providers document nor the token pass-through answers. Both stay cached in memory.
    const stores = client.ownStores;
    let known = new Set<string>();
    try {
      const providers = await ctx.userData.get('providers', { fresh: true });
      known = new Set(knownStores(providers).map((s) => s.ref));
    } catch {
      // No readable stores: nothing to delete on this device.
    }
    for (const ref of known) {
      if (isDriveRef(ref)) await stores.describe(ref).catch(() => {});
    }
    let left: Array<{ bucketRef: string; objectKey: string }>;
    try {
      left = (await ctx.api.request(deleteAccount, { body: { confirm: ACCOUNT_CONFIRM } }))
        .ownBucketRecordings;
    } catch {
      setDeleting(null);
      setFailed(true);
      return;
    }
    const mine = left.filter((r) => known.has(r.bucketRef));
    if (mine.length > 0) {
      setDeleting({ done: 0, total: mine.length });
      for (const [i, r] of mine.entries()) {
        await stores.delete(r.bucketRef, r.objectKey).catch(() => {});
        setDeleting({ done: i + 1, total: mine.length });
      }
    }
    await signOut();
  };

  return (
    <SettingsSection title={t('delete')} description={t('deleteBody')}>
      <div className="flex flex-col gap-3 py-3">
        {deleting && deleting.total > 0 ? (
          <JobProgress
            done={deleting.done}
            total={deleting.total}
            label={t('deleting', deleting)}
            labels={{ pause: '', resume: '', stop: '', progress: t('deleting', deleting) }}
          />
        ) : null}
        {failed ? <ErrorState scope="inline" title={t('deleteFailed')} /> : null}
        <div>
          <Button variant="destructive" loading={deleting !== null} onClick={() => setOpen(true)}>
            {deleting ? null : <Trash2 className="size-4" aria-hidden />}
            {t('deleteAction')}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('deleteTitle')}
        description={ownBucket.data ? `${t('deleteConfirm')} ${t('bucket')}` : t('deleteConfirm')}
        confirmLabel={t('deleteAction')}
        cancelLabel={tc('cancel')}
        typeToConfirm={{ label: t('deleteType', { email }), value: email }}
        onConfirm={() => void run()}
      />
    </SettingsSection>
  );
}

export default function DataSettingsPage() {
  return (
    <SectionScreen section="data">
      <div className="flex flex-col gap-6">
        <ExportSection />
        <DeleteSection />
      </div>
    </SectionScreen>
  );
}
