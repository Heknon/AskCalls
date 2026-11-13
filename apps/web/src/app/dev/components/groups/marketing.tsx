'use client';

import '@askcalls/ui/marketing.css';
import { DemoFrame } from '@askcalls/ui/components/DemoFrame';
import { FaqList } from '@askcalls/ui/components/FaqList';
import { LimitsTable } from '@askcalls/ui/components/LimitsTable';
import { MarketingFooter } from '@askcalls/ui/components/MarketingFooter';
import { MarketingHeader } from '@askcalls/ui/components/MarketingHeader';
import { StepList } from '@askcalls/ui/components/StepList';
import { TrustDiagram } from '@askcalls/ui/components/TrustDiagram';
import { UseCaseCard } from '@askcalls/ui/components/UseCaseCard';
import type { ReactNode } from 'react';
import { Specimen, useCopy } from '../shell';

const copy = {
  en: {
    links: ['Security', 'Pricing', 'Self-host', 'FAQ'],
    language: 'עברית',
    signIn: 'Sign in',
    start: 'Start free',
    labels: {
      brand: 'AskCalls',
      home: 'AskCalls home',
      nav: 'Site',
      menu: 'Menu',
      close: 'Close menu',
    },
    demo: {
      description: 'Demo: a search that decrypts on the device.',
      labels: {
        meaning: 'Meaning',
        pause: 'Pause',
        play: 'Play',
        matched: 'matched by meaning',
        decrypted: 'decrypted on this device · {ms} ms',
      },
      query: 'people interested in buying',
      row: ['Dana Levi', 'Today, 14:32 · 8 min', 'We measured. ', 'I’d like to reserve it', '.'],
    },
    steps: [
      ['Upload a year of calls.', 'Audio, transcripts or a whole folder.'],
      ['Find one by who, what, or what they meant.', 'Contact, date, words, tag or intent.'],
      ['Ask it what was promised.', 'Only that call goes to the AI, with your consent.'],
    ],
    uses: [
      ['asked for a quote this month, no reply yet', 'Sales follow-up', '14 calls, by meaning'],
      ['price objections, and how we answered', 'Team coaching', '31 calls, 6 people'],
    ],
    limits: [
      ['500', '', 'calls', 'A call is one transcript.'],
      ['300', '', 'transcription minutes a month', 'Counted by audio length.'],
      ['2', 'GB', 'of recording backups', 'Encrypted on your device.'],
    ],
    faq: [
      ['Can AskCalls staff see my calls?', 'No. We store ciphertext and keyed tokens.'],
      ['What if I lose my phone?', 'Unlock with your passkey or your recovery code.'],
    ],
    trust: {
      label: 'The same call on your device and on our server',
      boundary: 'Encrypted here',
      device: 'On your device',
      server: 'On our server',
      line: '“Then I can do 9,400 for the set.”',
    },
    footer: [
      ['Product', ['Pricing', 'MCP']],
      ['Trust', ['Security', 'Subprocessors']],
      ['Legal', ['Privacy policy', 'Terms']],
    ] as [string, string[]][],
    fine: ['Open source, MIT licensed.', '© 2026 AskCalls'],
  },
  he: {
    links: ['אבטחה', 'תמחור', 'אירוח עצמי', 'שאלות'],
    language: 'English',
    signIn: 'כניסה',
    start: 'להתחיל בחינם',
    labels: {
      brand: 'AskCalls',
      home: 'AskCalls, דף הבית',
      nav: 'האתר',
      menu: 'תפריט',
      close: 'סגירת התפריט',
    },
    demo: {
      description: 'הדגמה: חיפוש שמפוענח במכשיר.',
      labels: {
        meaning: 'משמעות',
        pause: 'השהיה',
        play: 'הפעלה',
        matched: 'נמצא לפי משמעות',
        decrypted: 'פוענח במכשיר הזה · {ms} ms',
      },
      query: 'מתעניינים לקנות',
      row: ['דנה לוי', 'היום, 14:32 · 8 דק׳', 'מדדנו. ', 'הייתי רוצה לשריין אותו', '.'],
    },
    steps: [
      ['מעלים שנה של שיחות.', 'קובצי שמע, תמלולים או תיקייה שלמה.'],
      ['מוצאים אחת לפי מי, מה, או מה התכוונו.', 'איש קשר, תאריך, מילים, תגית או כוונה.'],
      ['שואלים אותה מה הובטח.', 'רק השיחה הזו נשלחת ל-AI, בהסכמתך.'],
    ],
    uses: [
      ['ביקשו הצעת מחיר החודש ועוד לא קיבלו תשובה', 'מעקב מכירות', '14 שיחות, לפי משמעות'],
      ['התנגדויות למחיר, ואיך ענינו', 'הדרכת צוות', '31 שיחות, 6 נציגים'],
    ],
    limits: [
      ['500', '', 'שיחות', 'שיחה היא תמלול אחד.'],
      ['300', '', 'דקות תמלול בחודש', 'נספר לפי אורך השמע.'],
      ['2', 'GB', 'גיבוי הקלטות', 'מוצפן במכשיר.'],
    ],
    faq: [
      [
        'עובדי AskCalls יכולים לראות את השיחות שלי?',
        'לא. אנחנו שומרים טקסט מוצפן וטוקנים עם מפתח.',
      ],
      ['מה קורה אם הטלפון שלי אבד?', 'פותחים עם ה-passkey או עם קוד השחזור.'],
    ],
    trust: {
      label: 'אותה שיחה במכשיר שלך ובשרת שלנו',
      boundary: 'מוצפן כאן',
      device: 'במכשיר שלך',
      server: 'בשרת שלנו',
      line: '„אז אני יכול לעשות 9,400 על הסט.”',
    },
    footer: [
      ['מוצר', ['תמחור', 'MCP']],
      ['אמון', ['אבטחה', 'ספקי משנה']],
      ['משפטי', ['מדיניות פרטיות', 'תנאי שימוש']],
    ] as [string, string[]][],
    fine: ['קוד פתוח, רישיון MIT.', '© 2026 AskCalls'],
  },
};

/** The marketing scope: these components are styled by marketing.css under `.mk`. */
function Mk({ ink = false, children }: { ink?: boolean; children: ReactNode }) {
  return (
    <div className="mk overflow-hidden rounded-lg border border-border">
      <div className={ink ? 'ink relative py-6' : 'relative p-6'}>{children}</div>
    </div>
  );
}

export function MarketingGroup() {
  const c = useCopy(copy);
  const [name, when, before, hit, after] = c.demo.row;
  return (
    <>
      <Specimen name="MarketingHeader" note="over the dark hero; menu below 1100 px" wide>
        <Mk ink>
          <div className="h-[72px]">
            <MarketingHeader
              homeHref="#"
              links={c.links.map((label, i) => ({ href: `#l${i}`, label, current: i === 0 }))}
              language={
                <a className="quiet" href="#lang">
                  {c.language}
                </a>
              }
              signIn={{ href: '#', label: c.signIn }}
              start={{ href: '#', label: c.start }}
              labels={c.labels}
            />
          </div>
        </Mk>
      </Specimen>
      <Specimen name="DemoFrame" note="end state; loops unless reduced motion" wide>
        <Mk ink>
          <div className="wrap">
            <DemoFrame
              description={c.demo.description}
              labels={c.demo.labels}
              queries={[
                {
                  query: c.demo.query,
                  rows: [
                    {
                      name: name!,
                      phone: '+972 50-555-0112',
                      when: when!,
                      dir: c === copy.he ? 'rtl' : 'ltr',
                      before: before!,
                      hit: hit!,
                      after: after!,
                    },
                  ],
                },
              ]}
            />
          </div>
        </Mk>
      </Specimen>
      <Specimen name="StepList" note='size="display" and "compact"' wide>
        <Mk>
          <StepList
            steps={c.steps.map(([title, note]) => ({ key: title!, title: title!, note: note! }))}
          />
          <div className="mt-8">
            <StepList
              size="compact"
              steps={c.steps.map(([title, note]) => ({ key: title!, title: title!, note: note! }))}
            />
          </div>
        </Mk>
      </Specimen>
      <Specimen name="UseCaseCard" wide>
        <Mk>
          <ul className="qs">
            {c.uses.map(([query, role, result]) => (
              <UseCaseCard key={query} query={query!} role={role!} result={result!} />
            ))}
          </ul>
        </Mk>
      </Specimen>
      <Specimen name="LimitsTable" note='variant="teaser" and "sheet"' wide>
        <Mk>
          {(['teaser', 'sheet'] as const).map((variant) => (
            <div key={variant} className="mb-8">
              <LimitsTable
                variant={variant}
                label="Limits"
                limits={c.limits.map(([value, unit, label, detail]) => ({
                  key: label!,
                  value: value!,
                  unit: unit || undefined,
                  label: label!,
                  detail,
                }))}
              />
            </div>
          ))}
        </Mk>
      </Specimen>
      <Specimen name="TrustDiagram" note="dark privacy chapter" wide>
        <Mk ink>
          <div className="wrap">
            <TrustDiagram
              label={c.trust.label}
              boundary={c.trust.boundary}
              device={{
                title: c.trust.device,
                items: [
                  { field: 'transcript', value: c.trust.line },
                  { field: 'tag', value: c.labels.brand },
                ],
              }}
              server={{
                title: c.trust.server,
                items: [
                  { field: 'transcriptCt · AES-256-GCM', value: '01 7f3e2a90 c4d1b8e2 …' },
                  { field: 'tagToks', value: '[-4417203365117839012]' },
                ],
              }}
            />
          </div>
        </Mk>
      </Specimen>
      <Specimen name="FaqList" note="native details, second item open" wide>
        <Mk>
          <FaqList
            open={c.faq[1]![0]}
            items={c.faq.map(([question, answer]) => ({
              key: question!,
              question: question!,
              answer: <p>{answer}</p>,
            }))}
          />
        </Mk>
      </Specimen>
      <Specimen name="MarketingFooter" wide>
        <Mk ink>
          <MarketingFooter
            brand="AskCalls"
            fine={c.fine}
            columns={c.footer.map(([title, links]) => ({
              title,
              links: links.map((label, i) => ({ href: `#${title}${i}`, label })),
            }))}
          />
        </Mk>
      </Specimen>
    </>
  );
}
