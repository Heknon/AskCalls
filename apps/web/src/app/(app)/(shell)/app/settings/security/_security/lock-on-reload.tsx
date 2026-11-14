'use client';

import { Label } from '@askcalls/ui/primitives/label';
import { Switch } from '@askcalls/ui/primitives/switch';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { lockOnReload, setLockOnReload } from '../../../../../../../client/lock-on-reload';
import { useNotify } from '../../../../../../../client/notices/notices';
import { useUnlocked } from '../../../../../../../client/session/session';

/** The "Lock on reload" row of the auto-lock section, saved per browser; loads after the page. */
export function LockOnReload({ onFailed }: { onFailed: (failed: boolean) => void }) {
  const t = useTranslations('settings.sec.autolock');
  const { client } = useUnlocked();
  const notify = useNotify();
  const id = useId();
  const [on, setOn] = useState(lockOnReload);

  const save = async (next: boolean) => {
    onFailed(false);
    try {
      setLockOnReload(next);
      setOn(next);
      await client.resume.refresh();
      notify({ kind: 'event', icon: Lock, title: t('saved') });
    } catch {
      setLockOnReload(on);
      setOn(on);
      onFailed(true);
    }
  };

  return (
    <div className="flex items-start gap-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Label htmlFor={id}>{t('onReload')}</Label>
        <p id={`${id}-detail`} className="text-muted-foreground text-sm">
          {t('onReloadDetail')}
        </p>
      </div>
      <Switch
        id={id}
        checked={on}
        onCheckedChange={(v) => void save(v)}
        aria-describedby={`${id}-detail`}
      />
    </div>
  );
}
