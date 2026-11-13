'use client';

import { LanguageSwitcher } from '@askcalls/ui/components/LanguageSwitcher';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { LOCALES, localeDir, localeName } from '../../i18n/locales';
import { saveLocale } from '../../server/actions/locale';

const OPTIONS = LOCALES.map((l) => ({ value: l, label: localeName(l) }));

/**
 * The language control for headers and Settings. Saves the choice (cookie, and the account when
 * signed in) and re-renders the server components in place: no reload, so an unlocked session
 * stays unlocked.
 */
export function LanguageControl() {
  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <LanguageSwitcher
      value={locale}
      options={OPTIONS}
      label={t('language')}
      busy={pending}
      onChange={(next) =>
        start(async () => {
          await saveLocale(next);
          document.documentElement.lang = next;
          document.documentElement.dir = localeDir(next);
          router.refresh();
        })
      }
    />
  );
}
