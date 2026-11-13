import type { CallRowCall } from '@askcalls/ui/components/CallRow';
import type { Lang } from './shell';

const at = (iso: string) => new Date(iso);

/** Fake people and +972 55-5xxx numbers reserved for fiction. Mixed Hebrew and English on purpose. */
export function sampleCalls(lang: Lang): (CallRowCall & { id: string })[] {
  const he = lang === 'he';
  return [
    {
      id: 'c1',
      name: 'דנה לוי',
      phone: '+972525550134',
      direction: 'incoming',
      startedAt: at('2026-11-13T14:32:00'),
      durationSec: 492,
      starred: true,
      snippet: {
        text: '…אנחנו משפצים דירה ברחוב ביאליק, ורוצה לדעת מה המחיר למטבח באורך ארבעה מטר, עם אי. שלחתי לך בוואטסאפ תמונות מה-iPhone…',
        hits: ['מחיר'],
      },
      tags: [
        {
          id: 't1',
          name: he ? 'ליד חם' : 'Hot lead',
          colour: 'rose',
          source: 'rule',
          ruleLabel: he ? 'נוסף על ידי הכלל „לידים חמים”' : 'Added by the rule “Hot leads”',
        },
        { id: 't2', name: he ? 'נשלחה הצעה' : 'Quote sent', colour: 'blue' },
        {
          id: 't3',
          name: he ? 'עניין ברכישה' : 'Purchase interest',
          colour: 'gray',
          source: 'intent',
        },
      ],
    },
    {
      id: 'c2',
      name: he ? 'יוסי מזרחי' : 'Yossi Mizrahi',
      phone: '+972545550178',
      direction: 'outgoing',
      startedAt: at('2026-11-12T18:05:00'),
      durationSec: 184,
      starred: false,
      snippet: {
        text: '…Can you send the price for the oak finish before Sunday? My partner wants to compare it with the other quote…',
        hits: ['price'],
      },
      tags: [{ id: 't4', name: he ? 'מעקב' : 'Follow-up', colour: 'amber' }],
    },
    {
      id: 'c3',
      phone: '+97235550199',
      direction: 'incoming',
      startedAt: at('2026-11-10T09:12:00'),
      durationSec: 131,
      starred: false,
      snippet: {
        text: '…רציתי לשאול על מחירים של התקנה בלבד, יש לנו כבר ארונות מ-IKEA…',
        hits: ['מחירים'],
      },
      tags: [],
    },
    {
      id: 'c4',
      name: 'Maya Cohen',
      phone: '+972505550112',
      direction: 'unknown',
      startedAt: at('2026-11-09T12:40:00'),
      durationSec: 845,
      starred: true,
      snippet: {
        text: '…ההצעה שקיבלנו במחיר של 52 אלף כוללת גם את המשטח? כי בטלפון הקודם דיברו על קוורץ…',
        hits: ['במחיר'],
      },
      tags: [{ id: 't5', name: 'VIP', colour: 'violet' }],
    },
    {
      id: 'c5',
      hidden: true,
      direction: 'incoming',
      startedAt: at('2025-12-30T20:15:00'),
      durationSec: 42,
      starred: false,
      tags: [],
    },
  ];
}

export const TRANSCRIPT = [
  { speaker: 'you', start: 0, text: 'סטודיו נועה מטבחים, שלום, מדבר עומר.' },
  {
    speaker: 'them',
    start: 4,
    text: 'היי עומר, זאת דנה לוי. ראיתי ב-Instagram את המטבח שעשיתם בפרויקט ברמת גן.',
  },
  { speaker: 'you', start: 12, text: 'כן, בטח. במה אפשר לעזור?' },
  {
    speaker: 'them',
    start: 15,
    text: 'אנחנו משפצים דירה ברחוב ביאליק, ורוצה לדעת מה המחיר למטבח באורך ארבעה מטר, עם אי.',
  },
  {
    speaker: 'you',
    start: 26,
    text: 'תלוי בחומרים. בפורניר אלון זה בסביבות 48 אלף, כולל משטח קוורץ.',
  },
  {
    speaker: 'them',
    start: 35,
    text: 'OK. And does that price include installation, or is that separate?',
  },
  { speaker: 'them', start: 39, text: 'Asking because the last quote did not.' },
  { speaker: 'you', start: 41, text: 'ההתקנה כלולה. ההובלה ב-1,200 ש״ח.' },
] as const;

/** A 25 x 25 QR-like module grid with finder patterns, for display only. */
export function sampleQr(): boolean[][] {
  const n = 25;
  const grid = Array.from({ length: n }, (_, y) =>
    Array.from({ length: n }, (_, x) => ((x * 7 + y * 13 + x * y) % 5 < 2) as boolean),
  );
  const finder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        const row = grid[oy + y];
        if (row) row[ox + x] = edge || core;
      }
    for (let i = -1; i <= 7; i++) {
      for (const [x, y] of [
        [ox + i, oy - 1],
        [ox + i, oy + 7],
        [ox - 1, oy + i],
        [ox + 7, oy + i],
      ] as const) {
        const row = grid[y];
        if (row && x >= 0 && x < n) row[x] = false;
      }
    }
  };
  finder(0, 0);
  finder(n - 7, 0);
  finder(0, n - 7);
  return grid;
}
