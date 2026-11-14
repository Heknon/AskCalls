'use client';

import type { FileRef } from '@askcalls/client-core/bulk/pairing';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { Button } from '@askcalls/ui/primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@askcalls/ui/primitives/dialog';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useAppSession } from '../../../../../../client/session/session';
import type { BulkController } from './bulk-controller';

/**
 * A recording whose transcript came back empty, played from the user's own file so they can
 * decide whether to keep it as a call with no transcript. The audio never leaves the device here.
 */
export function EmptyCallDialog({
  controller,
  item,
  onClose,
}: {
  controller: BulkController;
  item: { id: string; fileName: string; audio: FileRef };
  onClose: () => void;
}) {
  const t = useTranslations('upload.bulk');
  const tc = useTranslations('common');
  const { client } = useAppSession();
  const [audio, setAudio] = useState<{ state: 'loading' | 'ready' | 'error'; src?: string }>({
    state: 'loading',
  });

  useEffect(() => {
    let url: string | null = null;
    let stale = false;
    client!.bulkFiles.audio(item.audio).then(
      (src) => {
        const blob =
          src instanceof Blob
            ? src
            : 'bytes' in src
              ? new Blob([src.bytes as BlobPart], { type: src.mimeType })
              : null;
        if (stale) return;
        if (!blob) return setAudio({ state: 'error' });
        url = client!.blobUrls.create(blob);
        setAudio({ state: 'ready', src: url });
      },
      () => !stale && setAudio({ state: 'error' }),
    );
    return () => {
      stale = true;
      if (url) client!.blobUrls.revoke(url);
    };
  }, [client, item.audio]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent closeLabel={tc('close')}>
        <DialogHeader>
          <DialogTitle>{t('emptyTitle')}</DialogTitle>
          <DialogDescription>{t('emptyBody')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <bdi dir="ltr" className="block truncate font-mono text-sm" title={item.fileName}>
            {item.fileName}
          </bdi>
          {audio.state === 'error' ? (
            <ErrorState scope="inline" title={t('playError')} />
          ) : audio.src ? (
            // biome-ignore lint/a11y/useMediaCaption: the user's own recording, played to check it has no speech
            <audio
              controls
              autoPlay
              src={audio.src}
              onError={() => setAudio({ state: 'error' })}
              className="w-full"
              dir="ltr"
            />
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              controller.saveEmpty(item.id);
              onClose();
            }}
          >
            {t('saveEmpty')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
