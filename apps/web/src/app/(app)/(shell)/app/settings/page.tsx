'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Screen } from '../../_shell/screen';
import { SettingsMenu } from './_settings/settings-nav';
import { sectionHref } from './_settings/sections';

const DESKTOP = '(min-width: 1024px)';

/** The section list on tablets and phones; on desktop the list is beside Security. */
export default function SettingsIndexPage() {
  const t = useTranslations('settings');
  const router = useRouter();
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const go = () => mq.matches && router.replace(sectionHref('security'));
    go();
    mq.addEventListener('change', go);
    return () => mq.removeEventListener('change', go);
  }, [router]);
  return (
    <Screen title={t('title')} width="form">
      <div className="lg:hidden">
        <SettingsMenu variant="index" />
      </div>
    </Screen>
  );
}
