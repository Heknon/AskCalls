import { DEFAULT_LOCALE, isLocale, type Locale } from './locales';

/** Legacy and regional tags that mean one of our languages. */
const ALIASES: Partial<Record<string, string>> = { iw: 'he' };

function fromTag(tag: string | null | undefined): Locale | null {
  if (!tag) return null;
  const lang = tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  const code = ALIASES[lang] ?? lang;
  return isLocale(code) ? code : null;
}

/** Languages from an Accept-Language header, best first (`q` order, then header order). */
export function acceptedLanguages(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(',')
    .map((part, i) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { tag: tag.trim(), weight: Number.isFinite(weight) ? weight : 0, i };
    })
    .filter((l) => l.tag && l.tag !== '*' && l.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.i - b.i)
    .map((l) => l.tag);
}

/** Spec 4: account setting, then the `locale` cookie, then Accept-Language, then English. */
export function resolveLocale(input: {
  account?: string | null;
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  const chosen = fromTag(input.account) ?? fromTag(input.cookie);
  if (chosen) return chosen;
  for (const tag of acceptedLanguages(input.acceptLanguage)) {
    const l = fromTag(tag);
    if (l) return l;
  }
  return DEFAULT_LOCALE;
}
