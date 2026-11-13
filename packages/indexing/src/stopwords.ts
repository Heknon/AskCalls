import { normalizeWord } from './normalize';

const words = (list: string): string[] => list.split(/\s+/).filter(Boolean);

/**
 * Bundled stopword lists (spec 7.4). Entries are normalized at load, so they may be written with
 * final letters. Stopwords are dropped from both the index and queries, so a query term that is a
 * stopword is ignored rather than missed. Common prefixed function words (ולא, שזה) are listed
 * explicitly instead of being derived, because derivation would also drop real words (כלא, שכן).
 */
export const HEBREW_STOPWORDS: readonly string[] = words(`
  אני אתה את הוא היא אנחנו אנו אתם אתן הם הן
  אותי אותך אותו אותה אותנו אתכם אותם אותן
  לי לך לו לה לנו לכם להם להן
  שלי שלך שלו שלה שלנו שלכם שלהם שלהן
  בי בך בו בה בנו בהם עליו עליה עלי עליך עלינו עליהם
  ממני ממך ממנו ממנה מהם איתי איתך איתו איתה איתנו איתם אתי
  זה זאת זו אלה אלו הזה הזאת הזו האלה האלו ההוא ההיא
  של על אל עם בין אצל לפני אחרי תחת מול ליד בלי כמו בשביל
  עד מן אם או גם אבל אך כי רק אלא לכן כדי כאשר כש ש ו
  אז כך ככה כן לא אין יש היה הייתה היו יהיה תהיה להיות
  מה מי איך איפה מתי למה מדוע כמה איזה איזו אילו לאן מאיפה
  פה כאן שם עכשיו כבר עוד מאוד ממש סתם בדיוק אולי בטח טוב
  נו אה אהה אמ אממ הממ אוקיי אוקי יאללה כאילו בעצם פשוט די
  הכל הכול כל כולם משהו מישהו שום
  ולא שלא וגם שגם וזה שזה וזאת שזאת ואני שאני ואתה שאתה והוא
  שהוא והיא שהיא ואנחנו שאנחנו והם שהם ויש שיש ואין שאין ואז
  וכן ועוד שעוד וכל שכל והכל ומה שמה ואם כשאני כשהוא כשהיא
  ובין ועם ועל שעל שאם ואו היה שהיה שהייתה שהיו
`);

export const ENGLISH_STOPWORDS: readonly string[] = words(`
  a an the and or but if then else so than too very
  i me my mine myself we us our ours you your yours he him
  his she her hers it its they them their theirs this that
  these those who whom whose which what when where why how
  am is are was were be been being have has had having do
  does did doing will would shall should can could may might must
  of at by for with about against between into through during
  before after above below to from up down in out on off over
  under again further once here there all any both each few more
  most other some such no nor not only own same just now
  i'm you're he's she's it's we're they're i've you've we've
  they've i'd you'd he'd she'd we'd they'd i'll you'll he'll
  she'll we'll they'll isn't aren't wasn't weren't hasn't haven't
  hadn't doesn't don't didn't won't wouldn't can't cannot couldn't
  shouldn't let's that's there's what's here's
  im youre hes shes ive dont didnt doesnt isnt wasnt cant wont
  yes yeah yep ok okay oh uh um uhm hmm mm mhm ah like
  well right really also got get go going gonna wanna kind sort
`);

export type StopwordSet = ReadonlySet<string>;

export function buildStopwordSet(...lists: ReadonlyArray<readonly string[]>): StopwordSet {
  const set = new Set<string>();
  for (const list of lists) {
    for (const w of list) {
      const n = normalizeWord(w);
      if (n) set.add(n);
    }
  }
  return set;
}

/** Hebrew and English, normalized. */
export const DEFAULT_STOPWORDS: StopwordSet = buildStopwordSet(HEBREW_STOPWORDS, ENGLISH_STOPWORDS);
