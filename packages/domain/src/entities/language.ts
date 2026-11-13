import type { TranslationLanguage } from './transcript';

/**
 * ISO 639-2/639-3 codes and English names that providers and file formats report, mapped to
 * ISO 639-1. Whisper reports names ("hebrew"), ElevenLabs three-letter codes ("heb"), older
 * Java-era tools "iw".
 */
const ALIASES: Record<string, string> = {
  iw: 'he',
  heb: 'he',
  hebrew: 'he',
  eng: 'en',
  english: 'en',
  ara: 'ar',
  arb: 'ar',
  arabic: 'ar',
  rus: 'ru',
  russian: 'ru',
  fra: 'fr',
  fre: 'fr',
  french: 'fr',
  spa: 'es',
  spanish: 'es',
  deu: 'de',
  ger: 'de',
  german: 'de',
  amh: 'am',
  amharic: 'am',
  yid: 'yi',
  yiddish: 'yi',
  ukr: 'uk',
  ukrainian: 'uk',
  por: 'pt',
  portuguese: 'pt',
  ita: 'it',
  italian: 'it',
  tur: 'tr',
  turkish: 'tr',
  pol: 'pl',
  polish: 'pl',
  ron: 'ro',
  rum: 'ro',
  romanian: 'ro',
  fas: 'fa',
  per: 'fa',
  persian: 'fa',
  zho: 'zh',
  chi: 'zh',
  chinese: 'zh',
  hin: 'hi',
  hindi: 'hi',
  tha: 'th',
  thai: 'th',
};

/**
 * A language tag as reported by a provider, a file or the user, as an ISO 639-1 code: `en-US`,
 * `eng`, `English` and `en` all become `en`. Null for `auto`, empty or unrecognised input.
 */
export function normalizeLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null;
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  if (primary === 'auto' || primary === 'und') return null;
  const mapped = ALIASES[primary] ?? primary;
  return /^[a-z]{2}$/.test(mapped) ? mapped : null;
}

const SCRIPTS: Array<{ re: RegExp; lang: string }> = [
  { re: /\p{Script=Hebrew}/gu, lang: 'he' },
  { re: /\p{Script=Arabic}/gu, lang: 'ar' },
  { re: /\p{Script=Cyrillic}/gu, lang: 'ru' },
  { re: /\p{Script=Latin}/gu, lang: 'en' },
];

/**
 * Language from the writing system when no provider or file says: the script with the most
 * letters wins. Hebrew, Arabic and Cyrillic map to he, ar and ru; Latin script is taken as
 * English, which only decides that the call also gets a Hebrew version. Null without letters.
 */
export function detectLanguage(text: string): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const { re, lang } of SCRIPTS) {
    const n = text.match(re)?.length ?? 0;
    if (n > bestCount) {
      best = lang;
      bestCount = n;
    }
  }
  return best;
}

/**
 * The reported language when it is usable, else the detected one. A report that contradicts the
 * script (a "he" label on Latin text) loses to the script: it would otherwise skip a translation.
 */
export function resolveLanguage(reported: string | null | undefined, text: string): string | null {
  const fromReport = normalizeLanguage(reported);
  const detected = detectLanguage(text);
  if (!fromReport) return detected;
  if (detected && fromReport !== detected && (fromReport === 'he' || fromReport === 'en')) {
    return detected;
  }
  return fromReport;
}

/**
 * One translation rule from the user's settings: calls in `from` (or, for `any`, in a language
 * no other rule names) are also stored in each `to` language.
 */
export interface TranslationRule {
  from: string | 'any';
  to: string[];
}

/** Most translations one call gets: each is a text to index, embed and store. */
export const MAX_TRANSLATIONS_PER_CALL = 4;

/**
 * The languages a call in `language` is translated into under `rules`: the rule for its language,
 * else the `any` rule, never its own language, at most MAX_TRANSLATIONS_PER_CALL. A call whose
 * language is unknown only follows `any`. No rules: no translation.
 */
export function translationTargets(
  language: string | null,
  rules: readonly TranslationRule[],
): TranslationLanguage[] {
  const rule =
    (language ? rules.find((r) => r.from === language) : undefined) ??
    rules.find((r) => r.from === 'any');
  if (!rule) return [];
  return [...new Set(rule.to)].filter((l) => l !== language).slice(0, MAX_TRANSLATIONS_PER_CALL);
}

/**
 * What keyword search will match under `rules`, for the Settings card: for each rule, the
 * languages its calls are also searchable in, and the directions it leaves one-way.
 */
export function oneWayDirections(rules: readonly TranslationRule[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const r of rules) {
    if (r.from === 'any') continue;
    for (const to of r.to) {
      const back = translationTargets(to, rules);
      if (!back.includes(r.from)) out.push([r.from, to]);
    }
  }
  return out;
}

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

/** Every ISO 639-1 code. */
export const ISO_639_1 = (
  'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy ' +
  'da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu ' +
  'hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb ' +
  'lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om ' +
  'or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ' +
  'ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu'
).split(' ');
