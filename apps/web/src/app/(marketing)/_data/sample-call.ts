import type { TranscriptSegment } from '@askcalls/domain';

/**
 * The call the marketing pages show in the call view crop and the privacy diagram: made up,
 * with a 555 number that reaches nobody. `cited` is the turn the Ask answer points to.
 */
export interface MarketingCall {
  contactName: string;
  phone: string;
  phoneE164: string;
  tag: string;
  startedAt: string;
  durationSec: number;
  cited: number;
  segments: TranscriptSegment[];
}

const turn = (start: number, speaker: string, text: string, end: number): TranscriptSegment => ({
  start,
  end,
  speaker,
  text,
});

export const MARKETING_CALL: Record<'en' | 'he', MarketingCall> = {
  en: {
    contactName: 'Dana Levi',
    phone: '+972 50-555-0112',
    phoneE164: '+972505550112',
    tag: 'Hot lead',
    startedAt: '2026-11-13T12:32:00Z',
    durationSec: 494,
    cited: 3,
    segments: [
      turn(
        0,
        'Dana Levi',
        "Hi, it's Dana. I was in the showroom on Friday, about the oak table.",
        41,
      ),
      turn(41, 'You', 'Of course. The 2.4 metre one, with the natural oil finish.', 178),
      turn(
        178,
        'Dana Levi',
        'Right. And if we take the six chairs as well, where does that land?',
        252,
      ),
      turn(
        252,
        'You',
        'Then I can do 9,400 for the set, delivery included, if you confirm by Sunday.',
        270,
      ),
      turn(270, 'Dana Levi', 'Let me talk to Eitan tonight. Can you send that in writing?', 494),
    ],
  },
  he: {
    contactName: 'דנה לוי',
    phone: '+972 50-555-0112',
    phoneE164: '+972505550112',
    tag: 'ליד חם',
    startedAt: '2026-11-13T12:32:00Z',
    durationSec: 494,
    cited: 3,
    segments: [
      turn(0, 'דנה לוי', 'היי, זאת דנה. הייתי באולם התצוגה ביום שישי, לגבי שולחן האלון.', 41),
      turn(41, 'אני', 'בטח. זה של 2.40 מטר, בגימור שמן טבעי.', 178),
      turn(178, 'דנה לוי', 'נכון. ואם ניקח גם את שישת הכיסאות, לאן זה מגיע?', 252),
      turn(252, 'אני', 'אז אני יכול לעשות 9,400 על הסט, כולל הובלה, אם מאשרים עד יום ראשון.', 270),
      turn(270, 'דנה לוי', 'אני אדבר עם איתן הערב. אפשר לקבל את זה בכתב?', 494),
    ],
  },
};
