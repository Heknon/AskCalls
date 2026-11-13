'use client';

import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { UsageMeter } from '@askcalls/ui/components/UsageMeter';
import { Label } from '@askcalls/ui/primitives/label';
import { Switch } from '@askcalls/ui/primitives/switch';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useUnlocked } from '../../../../../../client/session/session';
import { intlLocale } from '../../../../../../i18n/locales';
import { AsyncView, useAsync } from '../../../_shell/states';
import { SectionScreen } from '../_settings/section-screen';
import { sectionHref } from '../_settings/sections';

const GB = 1024 ** 3;

/** S2 Recordings: the default backup choice for new uploads and storage used. */
export default function RecordingsSettingsPage() {
  const t = useTranslations('settings.rec');
  const ts = useTranslations('settings');
  const { ctx, me } = useUnlocked();
  const locale = intlLocale(useLocale());
  const id = useId();
  const docs = useAsync(
    () => Promise.all([ctx.userData.get('settings'), ctx.userData.get('providers')]),
    [ctx],
  );
  const [backup, setBackup] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  const save = async (on: boolean) => {
    setBackup(on);
    setFailed(false);
    try {
      await ctx.userData.update('settings', (s) => ({ ...s, backupRecordings: on }));
    } catch {
      setBackup(null);
      setFailed(true);
    }
  };

  return (
    <SectionScreen section="recordings">
      <AsyncView state={docs}>
        {([settings, providers]) => (
          <SettingsSection title={t('backup')}>
            <div className="flex items-start gap-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Label htmlFor={id}>{t('default')}</Label>
                <p id={`${id}-d`} className="text-muted-foreground text-sm">
                  {t('defaultDetail')}
                </p>
              </div>
              <Switch
                id={id}
                checked={backup ?? settings.backupRecordings}
                onCheckedChange={(on) => void save(on)}
                aria-describedby={`${id}-d`}
              />
            </div>
            {failed ? <ErrorState scope="inline" title={ts('saveFailed')} /> : null}
            <div className="flex flex-col gap-3 border-border border-t py-4">
              <UsageMeter
                label={t('used')}
                used={Number((me.usage.recordingBytes / GB).toFixed(2))}
                limit={me.limits.recordingBytes / GB}
                unit="GB"
                locale={locale}
              />
              <p className="text-muted-foreground text-sm">
                {t('where', { place: t(`place.${providers.recordings.mode}`) })} ·{' '}
                <Link href={sectionHref('providers')}>{t('change')}</Link>
              </p>
            </div>
          </SettingsSection>
        )}
      </AsyncView>
    </SectionScreen>
  );
}
