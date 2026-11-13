'use client';

import { SettingsNav } from '@askcalls/ui/components/SettingsNav';
import { Label } from '@askcalls/ui/primitives/label';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { LanguageControl } from '../../../../../../client/i18n/language-switcher';
import { SETTINGS_SECTIONS, sectionHref } from './sections';

/** The section list (desktop column, or the phone index) and the language control under it. */
export function SettingsMenu({ variant }: { variant: 'list' | 'index' }) {
  const t = useTranslations('settings');
  const pathname = usePathname();
  const id = useId();
  const active = SETTINGS_SECTIONS.find((s) => pathname === sectionHref(s));
  return (
    <div className="flex flex-col gap-6">
      <SettingsNav
        variant={variant}
        label={t('sectionsLabel')}
        active={active}
        items={SETTINGS_SECTIONS.map((key) => ({
          key,
          href: sectionHref(key),
          label: t(`sections.${key}`),
        }))}
        linkAs={Link}
      />
      <div className="flex flex-col items-start gap-1.5 px-2.5">
        <Label id={id} aria-hidden>
          {t('language.label')}
        </Label>
        <LanguageControl />
      </div>
    </div>
  );
}
