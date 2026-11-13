/**
 * The UI languages. Adding one (Arabic, Russian) is: a folder of message files under
 * `messages/<code>/`, one per namespace, and its code here. Direction, the language's own name
 * and the Intl locale follow from the code.
 */
export const LOCALES = ['en', 'he'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

/** The cookie that remembers the choice for signed-out pages and new sessions. */
export const LOCALE_COOKIE = 'locale';

const RTL_LANGUAGES: ReadonlySet<string> = new Set([
  'ar',
  'ckb',
  'dv',
  'fa',
  'he',
  'ps',
  'ur',
  'yi',
]);

/** Region used for dates and numbers, so "10 Nov" and "10 בנוב׳" read as people expect. */
const INTL_LOCALE: Partial<Record<string, string>> = { en: 'en-GB', he: 'he-IL' };

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function localeDir(locale: string): 'rtl' | 'ltr' {
  return RTL_LANGUAGES.has(locale.split('-')[0]!.toLowerCase()) ? 'rtl' : 'ltr';
}

export function intlLocale(locale: string): string {
  return INTL_LOCALE[locale] ?? locale;
}

/** The language's name in itself: "English", "עברית". */
export function localeName(locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}
