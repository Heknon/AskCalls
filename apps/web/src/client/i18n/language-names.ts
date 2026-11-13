/** ISO 639-1 codes the language picker offers, the most common for AskCalls users first. */
export const COMMON_LANGUAGES = [
  'he',
  'en',
  'ar',
  'ru',
  'fr',
  'es',
  'de',
  'am',
  'uk',
  'it',
  'pt',
  'tr',
  'pl',
  'ro',
  'fa',
  'yi',
  'zh',
  'hi',
  'th',
] as const;

/** Every ISO 639-1 code (a function, so pages that only name languages don't carry the list). */
export const iso6391 = () =>
  (
    'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy ' +
    'da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu ' +
    'hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb ' +
    'lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om ' +
    'or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ' +
    'ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'
  ).split(' ');

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
  const named = iso6391()
    .map((code) => ({
      code,
      native: nativeName(code),
      local: localName(code, uiLocale),
      common: common.has(code),
    }))
    .filter((o) => o.native !== o.code);
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
