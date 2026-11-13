import type { TranscriptSegment } from '@askcalls/domain';

/**
 * The bundled "Try it" calls (spec 11.3): made up, with 555 numbers that reach nobody. Each has
 * a word the guided search finds through a typo ("pirce" → price, "מחיק" → מחיר).
 */
export interface SampleCall {
  language: 'en' | 'he';
  contactName: string;
  phone: string;
  direction: 'in' | 'out';
  /** Days before today, at this local time. */
  daysAgo: number;
  time: [hour: number, minute: number];
  /** The guided search text, with its deliberate typo. */
  query: string;
  segments: TranscriptSegment[];
}

const turns = (speakers: [string, string], lines: [0 | 1, string, number][]) => {
  let at = 0;
  return lines.map(([who, text, seconds]) => {
    const seg = { start: at, end: at + seconds, speaker: speakers[who], text };
    at += seconds;
    return seg;
  });
};

export const SAMPLE_CALLS: Record<'en' | 'he', SampleCall> = {
  en: {
    language: 'en',
    contactName: 'Daniel Brooks',
    phone: '+972525550147',
    direction: 'in',
    daysAgo: 1,
    time: [16, 20],
    query: 'pirce',
    segments: turns(
      ['Daniel', 'You'],
      [
        [0, "Hi, it's Daniel Brooks. We met at the showroom on Thursday about the kitchen.", 6],
        [1, 'Of course. The oak cabinets with the long island, right?', 4],
        [
          0,
          "Exactly. My partner and I measured again, the wall is four metres twenty, not four. Does that change the price much?",
          9,
        ],
        [
          1,
          'A little. The extra twenty centimetres means one more narrow unit. I can send an updated price by tomorrow.',
          8,
        ],
        [0, 'Great. And the price includes installation and the stone worktop?', 5],
        [
          1,
          'Installation yes. The worktop is separate, about eleven thousand for quartz. Granite is a bit more.',
          8,
        ],
        [0, "Quartz is fine. If the quote is in by Sunday we'd like to put the deposit down next week.", 7],
        [1, "I'll have it to you before Sunday, with the delivery date. Speak soon.", 5],
      ],
    ),
  },
  he: {
    language: 'he',
    contactName: 'נועה לוי',
    phone: '+972545550162',
    direction: 'in',
    daysAgo: 1,
    time: [11, 5],
    query: 'מחיק',
    segments: turns(
      ['נועה', 'את/ה'],
      [
        [0, 'שלום, מדברת נועה לוי. היינו אצלכם באולם התצוגה ביום חמישי בקשר למטבח.', 6],
        [1, 'כן, בטח. ארונות האלון עם האי הארוך, נכון?', 4],
        [0, 'בדיוק. מדדנו שוב, הקיר הוא ארבעה מטר ועשרים ולא ארבעה. זה משנה הרבה את המחיר?', 9],
        [1, 'קצת. עשרים הסנטימטרים הנוספים הם עוד יחידה צרה. אני יכול לשלוח מחיר מעודכן עד מחר.', 8],
        [0, 'מצוין. והמחיר כולל התקנה ומשטח אבן?', 5],
        [1, 'התקנה כן. המשטח בנפרד, בערך אחד עשר אלף לקוורץ. גרניט קצת יותר.', 8],
        [0, 'קוורץ מתאים לנו. אם ההצעה תגיע עד יום ראשון, נשאיר מקדמה בשבוע הבא.', 7],
        [1, 'זה יגיע לפני יום ראשון, יחד עם תאריך האספקה. נדבר.', 5],
      ],
    ),
  },
};

export function sampleStartedAt(sample: SampleCall, now = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - sample.daysAgo);
  d.setHours(sample.time[0], sample.time[1], 0, 0);
  return d;
}
