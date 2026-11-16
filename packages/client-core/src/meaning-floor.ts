import { EMBEDDING_PASSAGE_PREFIX } from '@askcalls/indexing';
import type { Embedder } from './ports';

/**
 * Small talk that relates to nothing in particular, by language. A query's best score against a
 * language's lines is its score against unrelated speech in that language.
 */
export const BACKGROUND: Record<string, readonly string[]> = {
  en: [
    'Hi, how are you? Good, thanks. Listen, I wanted to ask you something quickly.',
    'Okay, okay. Yes. No, it is fine. Talk later, bye.',
    'Can you hear me? The line is bad. I will call you back in five minutes.',
    'I am on my way, I will be there in about twenty minutes.',
    'What did you say? Sorry, I did not catch that. Say it again.',
    'Fine, so we agreed. Send me a message with the details.',
    'Did you see what he wrote in the group? Yes, I saw. Funny.',
    'I am at work now, can we talk in the evening?',
  ],
  he: [
    'היי, מה שלומך? בסדר, תודה. תקשיב, רציתי לשאול אותך משהו.',
    'אוקיי, אוקיי. כן. לא, זה בסדר. נדבר אחר כך, ביי.',
    'אתה שומע אותי? הקו לא טוב. אני אחזור אליך עוד חמש דקות.',
    'אני בדרך, אגיע בעוד עשרים דקות בערך.',
    'מה אמרת? סליחה, לא שמעתי. תגיד שוב.',
    'טוב, אז סגרנו. תשלח לי הודעה עם הפרטים.',
    'ראית מה הוא כתב בקבוצה? כן, ראיתי. מצחיק.',
    'אני בעבודה עכשיו, אפשר לדבר בערב?',
  ],
};

/** How far above its small-talk score a call must score to count as related. */
export const MARGIN = 0.015;

const LANGS = Object.keys(BACKGROUND);
const LINES = LANGS.flatMap((lang) => BACKGROUND[lang]!.map((text) => ({ lang, text })));
const background = new WeakMap<Embedder, Promise<Float32Array[]>>();

function backgroundOf(embedder: Embedder): Promise<Float32Array[]> {
  let vectors = background.get(embedder);
  if (!vectors) {
    vectors = embedder.embed(
      LINES.map((l) => EMBEDDING_PASSAGE_PREFIX + l.text),
      { urgent: true },
    );
    background.set(embedder, vectors);
    vectors.catch(() => background.delete(embedder));
  }
  return vectors;
}

const dot = (a: Float32Array, b: Float32Array) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i]! * b[i]!;
  return d;
};

/** How far above the query's median score over the user's calls a call must score. */
export const ABOVE_MEDIAN = 0.02;
/** Under this many scored calls the median says little, and only small talk sets the bar. */
export const MIN_SCORED_CALLS = 10;

/**
 * The score a meaning hit needs for `query` (an L2-normalized query vector), by the language of
 * the hit's best chunk. The model scores almost any pair between 0.7 and 0.9, and where a query
 * lands in that band depends on the query, the language and the calls: "טמפרטורה" scores about
 * 0.81 against any speech, and a call scores as its best chunk, so long calls clear any fixed
 * floor by chance. A hit must clear three bars:
 * - the model's `minSimilarity`;
 * - the query's best score against small talk in the hit's language (every language's lines
 *   when it has none of its own), plus MARGIN;
 * - with at least MIN_SCORED_CALLS scored calls, the query's median score over the user's own
 *   calls (`median`, from the server), plus ABOVE_MEDIAN: a related call stands out from the
 *   user's other calls, an unrelated query scores them all alike.
 * On long chatter calls with a topic in some of them (`bun run models:calibrate`), unrelated
 * calls shown fall from 61% to 4% and 67% of related ones stay. Undefined when the embedder has
 * no calibrated floor: every hit is kept.
 */
export async function meaningFloor(
  embedder: Embedder,
  query: Float32Array,
  usual: { median: number | null; scoredCalls: number } = { median: null, scoredCalls: 0 },
): Promise<((lang: string | null) => number) | undefined> {
  const min = embedder.minSimilarity;
  if (min === undefined) return undefined;
  const scores = (await backgroundOf(embedder)).map((v) => dot(query, v));
  const best = (langs: readonly string[]) =>
    Math.max(...scores.filter((_, i) => langs.includes(LINES[i]!.lang)));
  const typical =
    usual.median !== null && usual.scoredCalls >= MIN_SCORED_CALLS
      ? usual.median + ABOVE_MEDIAN
      : min;
  const byLang = new Map(LANGS.map((l) => [l, Math.max(min, typical, best([l]) + MARGIN)]));
  const any = Math.max(min, typical, best(LANGS) + MARGIN);
  return (lang) => (lang && byLang.get(lang)) || any;
}
