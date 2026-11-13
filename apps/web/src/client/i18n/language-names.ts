import { COMMON_LANGUAGES, ISO_639_1 } from '@askcalls/domain';

/** A language's own name ("עברית", "Русский"), from the browser's CLDR data. */
export function nativeName(code: string): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** A language's name in the UI locale ("Hebrew" in the English UI). */
export function localName(code: string, uiLocale: string): string {
  try {
    return new Intl.DisplayNames([uiLocale], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export interface LanguageOption {
  code: string;
  native: string;
  local: string;
  common: boolean;
}

/** Every ISO 639-1 language the browser can name, the common ones first. */
export function languageOptions(uiLocale: string): LanguageOption[] {
  const common = new Set<string>(COMMON_LANGUAGES);
  const named = ISO_639_1.map((code) => ({
    code,
    native: nativeName(code),
    local: localName(code, uiLocale),
    common: common.has(code),
  })).filter((o) => o.native !== o.code);
  const first = COMMON_LANGUAGES.map((c) => named.find((o) => o.code === c)!).filter(Boolean);
  const rest = named
    .filter((o) => !o.common)
    .sort((a, b) => a.local.localeCompare(b.local, uiLocale));
  return [...first, ...rest];
}

/** Case- and accent-insensitive match on the code and both names. */
export function matchesLanguage(o: LanguageOption, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  return [o.code, o.native, o.local].some((s) => fold(s).includes(fold(q)));
}
