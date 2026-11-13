'use client';

import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { Label } from '@askcalls/ui/primitives/label';
import { Switch } from '@askcalls/ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { useSingleKeyShortcuts } from '../../../../../../client/shortcuts/shortcuts';

/** Settings → Privacy: turn single-character shortcuts off (WCAG 2.1.4). Saved per browser. */
export function ShortcutsSetting() {
  const t = useTranslations('settings.shortcuts');
  const [on, setOn] = useSingleKeyShortcuts();
  const id = useId();
  return (
    <SettingsSection title={t('title')}>
      <div className="flex items-start gap-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Label htmlFor={id}>{t('label')}</Label>
          <p id={`${id}-detail`} className="text-muted-foreground text-sm">
            {t('detail')}
          </p>
        </div>
        <Switch id={id} checked={on} onCheckedChange={setOn} aria-describedby={`${id}-detail`} />
      </div>
    </SettingsSection>
  );
}
