'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Screen, type ScreenProps } from '../../../_shell/screen';
import type { SettingsSectionKey } from './sections';

/** A Settings section page: its title, the back arrow to the index on phones, the form width. */
export function SectionScreen({
  section,
  children,
  ...rest
}: { section: SettingsSectionKey; children?: ReactNode } & Omit<
  ScreenProps,
  'title' | 'back' | 'width'
>) {
  const t = useTranslations('settings');
  return (
    <Screen
      title={t(`sections.${section}`)}
      back={{ href: '/app/settings', label: t('back') }}
      width="form"
      {...rest}
    >
      {children}
    </Screen>
  );
}
