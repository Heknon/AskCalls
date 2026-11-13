'use client';

import { applyAutoLockSetting } from '@askcalls/client-core/context';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { Label } from '@askcalls/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@askcalls/ui/primitives/select';
import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useNotify } from '../../../../../../../client/notices/notices';
import { useUnlocked } from '../../../../../../../client/session/session';
import { useAsync } from '../../../../_shell/states';

/** Spec 6.8 / S1: minutes of idle before locking. */
export const AUTO_LOCK_OPTIONS = [5, 15, 30, 60, 240] as const;

export function AutoLockSection() {
  const t = useTranslations('settings.sec.autolock');
  const ts = useTranslations('settings');
  const { ctx } = useUnlocked();
  const notify = useNotify();
  const id = useId();
  const settings = useAsync(() => ctx.userData.get('settings'), [ctx]);
  const [value, setValue] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const minutes = value ?? settings.data?.autoLockMinutes ?? 15;
  const options: number[] = AUTO_LOCK_OPTIONS.includes(minutes as 15)
    ? [...AUTO_LOCK_OPTIONS]
    : [...AUTO_LOCK_OPTIONS, minutes].sort((a, b) => a - b);

  const save = async (next: number) => {
    setValue(next);
    setFailed(false);
    try {
      await ctx.userData.update('settings', (s) => ({ ...s, autoLockMinutes: next }));
      await applyAutoLockSetting(ctx);
      notify({ kind: 'event', icon: Lock, title: t('saved') });
    } catch {
      setFailed(true);
      setValue(null);
    }
  };

  return (
    <SettingsSection title={t('title')}>
      <div className="flex flex-wrap items-center justify-between gap-3 py-3">
        <Label htmlFor={id}>{t('idleFor')}</Label>
        <Select
          value={String(minutes)}
          onValueChange={(v) => void save(Number(v))}
          disabled={settings.status !== 'ready'}
        >
          <SelectTrigger id={id} className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((m) => (
              <SelectItem key={m} value={String(m)}>
                {m % 60 === 0 && m >= 120 ? t('hours', { n: m / 60 }) : t('minutes', { n: m })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {failed ? (
        <div className="pb-3">
          <ErrorState scope="inline" title={ts('saveFailed')} />
        </div>
      ) : null}
    </SettingsSection>
  );
}
