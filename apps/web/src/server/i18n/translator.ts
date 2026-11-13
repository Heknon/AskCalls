import { createTranslator } from 'next-intl';
import en from './messages/en.json';
import he from './messages/he.json';

/**
 * Minimal locale resolution for pages outside the app shell: `locale` cookie, then
 * Accept-Language, then English (spec 4). Message files are per locale.
 */
export const MESSAGES = { en, he } as const;
export type Locale = keyof typeof MESSAGES;
const RTL: ReadonlySet<Locale> = new Set(['he']);

export function resolveLocale(cookieLocale: string | undefined, acceptLanguage: string | null) {
  const known = (l: string | undefined): l is Locale => !!l && l in MESSAGES;
  if (known(cookieLocale)) return cookieLocale;
  for (const part of (acceptLanguage ?? '').split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().split('-')[0];
    if (known(tag)) return tag;
  }
  return 'en' as Locale;
}

export function translator<N extends keyof typeof en>(locale: Locale, namespace: N) {
  return {
    t: createTranslator({ locale, messages: MESSAGES[locale] as typeof en, namespace }),
    dir: RTL.has(locale) ? ('rtl' as const) : ('ltr' as const),
  };
}
