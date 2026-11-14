'use client';

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
  item: { id: string; fileName: string };
  onClose: () => void;
}) {
  const t = useTranslations('upload.bulk');
  const tc = useTranslations('common');
  const [audio, setAudio] = useState<{ state: 'loading' | 'ready' | 'error'; src?: string }>({
    state: 'loading',
  });

  useEffect(() => {
    let url: string | null = null;
    let stale = false;
    controller.audioUrl(item.id).then(
      (src) => {
        if (stale || !src) {
          if (src) controller.revokeUrl(src);
          if (!stale) setAudio({ state: 'error' });
          return;
        }
        url = src;
        setAudio({ state: 'ready', src });
      },
      () => !stale && setAudio({ state: 'error' }),
    );
    return () => {
      stale = true;
      if (url) controller.revokeUrl(url);
    };
  }, [controller, item.id]);

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
