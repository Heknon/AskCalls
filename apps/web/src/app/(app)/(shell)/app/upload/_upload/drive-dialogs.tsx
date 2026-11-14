'use client';

import type { DriveEntry } from '@askcalls/client-core/bulk/drive';
import type { FileRef } from '@askcalls/client-core/bulk/pairing';
import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { DrivePicker } from '@askcalls/ui/components/DrivePicker';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { useAppSession } from '../../../../../../client/session/session';
import { intlLocale } from '../../../../../../i18n/locales';
import type { BulkController } from './bulk-controller';
import type { DriveSource } from './drive-source';

/** The queue references of Drive picks: folder trees walked, ZIPs downloaded and opened. */
async function driveRefs(
  controller: BulkController,
  addZip: (name: string, bytes: Uint8Array) => FileRef[],
  picked: readonly DriveEntry[],
): Promise<FileRef[]> {
  const drive = await controller.drive.load();
  const { files, zips } = await drive.collect(picked);
  for (const z of zips) files.push(...addZip(z.name, await drive.bytes(z)));
  return files;
}

/** The Drive picker and the one-time "Allow Google Drive" reload: loaded when opened. */
export function DriveDialogs({
  controller,
  drive,
}: {
  controller: BulkController;
  drive: DriveSource;
}) {
  const t = useTranslations('upload.bulk.drive');
  const tc = useTranslations('common');
  const locale = intlLocale(useLocale());
  const { client } = useAppSession();
  const load = useCallback(
    (folderId: string | null, token: string | null) =>
      controller.drive.load().then((d) => d.list(folderId ?? 'root', token ?? undefined)),
    [controller],
  );
  /** Turns Drive on for upload (`connect-src`); the page reloads to apply it. */
  const allow = async () => {
    try {
      await client!.ctx.userData.update('providers', (p) => ({ ...p, driveImport: true }));
      const { stale } = await client!.syncDirectAccess();
      if (stale) return window.location.reload();
    } catch {
      drive.setNotice('connectFailed');
    }
    drive.setEnabling(false);
  };
  return (
    <>
      <DrivePicker
        open={drive.picker}
        onOpenChange={drive.setPicker}
        load={load}
        onImport={(picked) =>
          void controller.addRefs(
            driveRefs(controller, (n, b) => client!.bulkFiles.addZipBytes(n, b), picked),
          )
        }
        locale={locale}
        labels={{
          title: t('title'),
          root: t('root'),
          path: t('path'),
          empty: t('empty'),
          failed: t('failed'),
          retry: tc('retry'),
          more: t('more'),
          cancel: tc('cancel'),
          close: tc('close'),
          importN: (n) => t('import', { n }),
          include: (name) => t('include', { name }),
          openFolder: (name) => t('open', { name }),
        }}
      />
      <ConfirmDialog
        open={drive.enabling}
        onOpenChange={drive.setEnabling}
        title={t('enableTitle')}
        description={t('enableBody')}
        confirmLabel={t('enable')}
        cancelLabel={tc('cancel')}
        onConfirm={() => void allow()}
      />
    </>
  );
}
