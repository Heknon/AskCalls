'use client';

import { DemoFrame } from '@askcalls/ui/components/DemoFrame';
import { FaqList } from '@askcalls/ui/components/FaqList';
import { FilterBlank } from '@askcalls/ui/components/FilterBlank';
import { LimitsTable } from '@askcalls/ui/components/LimitsTable';
import { MarketingFooter } from '@askcalls/ui/components/MarketingFooter';
import { MarketingHeader } from '@askcalls/ui/components/MarketingHeader';
import { StepList } from '@askcalls/ui/components/StepList';
import { UseCaseCard } from '@askcalls/ui/components/UseCaseCard';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@askcalls/ui/primitives/select';
import { Specimen, useCopy, useEnv } from '../shell';

const copy = {
  en: {
    links: ['How it works', 'Security', 'Pricing', 'FAQ', 'Self-host'],
    signIn: 'Sign in',
    start: 'Start free',
    nav: 'Site',
    menu: 'Menu',
    language: 'Language',
    steps: [
      [
        'Upload your calls',
        'Drop recordings or transcripts. Audio is transcribed once, then encrypted on your device.',
      ],
      [
        'Search like you remember',
        'Names, numbers, words in Hebrew or English, or what the call was about.',
      ],
      [
        'Ask about one call',
        'Get the promise, the price or the next step, with timestamps you can play.',
      ],
    ],
    useCases: [
      [
        'Find the quote you gave',
        'Every price you said, with the call it came from.',
        [
          ['about', 'Price question', 'intent'],
          ['from', 'this month', 'date'],
        ],
      ],
      [
        'Follow up on hot leads',
        'Calls a rule tagged while you were busy.',
        [
          ['tagged', 'Hot lead', 'tag'],
          ['', 'incoming only', 'direction'],
        ],
      ],
    ] as [string, string, [string, string, 'intent' | 'date' | 'tag' | 'direction'][]][],
    limitsLabel: 'Free beta limits',
    limits: [
      ['500', 'calls'],
      ['300 min', 'transcription a month'],
      ['50', 'questions a day'],
      ['2 GB', 'recording backups'],
      ['3', 'linked devices'],
    ],
    faq: [
      [
        'Can AskCalls read my calls?',
        'No. Transcripts are encrypted on your device before they reach the server. The exceptions are listed on the security page.',
      ],
      [
        'What happens if I lose my passkey?',
        'Use your recovery code. Without a passkey or the recovery code, calls cannot be recovered.',
      ],
      [
        'Does it work in Hebrew?',
        'Yes. Search, the interface and transcription all work in Hebrew and English, mixed in one call.',
      ],
    ],
    footer: [
      ['Product', ['How it works', 'Pricing', 'Self-host']],
      ['Trust', ['Security', 'Source code', 'Leak test']],
      ['Legal', ['Privacy', 'Terms', 'Contact']],
    ] as [string, string[]][],
    tagline: 'Ask your calls anything.',
    demo: 'A search for “מחיר” finds three calls and opens the one with Dana Levi.',
    play: 'Play',
    pause: 'Pause',
  },
  he: {
    links: ['איך זה עובד', 'אבטחה', 'מחירים', 'שאלות', 'אירוח עצמי'],
    signIn: 'כניסה',
    start: 'להתחיל בחינם',
    nav: 'אתר',
    menu: 'תפריט',
    language: 'שפה',
    steps: [
      ['מעלים את השיחות', 'גוררים הקלטות או תמלולים. השמע מתומלל פעם אחת ומוצפן במכשיר שלך.'],
      ['מחפשים כמו שזוכרים', 'שמות, מספרים, מילים בעברית או באנגלית, או על מה דיברו.'],
      ['שואלים על שיחה אחת', 'ההבטחה, המחיר או הצעד הבא, עם חותמות זמן שאפשר לנגן.'],
    ],
    useCases: [
      [
        'למצוא את ההצעה שנתת',
        'כל מחיר שאמרת, עם השיחה שממנה הוא הגיע.',
        [
          ['בנושא', 'שאלת מחיר', 'intent'],
          ['', 'החודש', 'date'],
        ],
      ],
      [
        'לחזור ללידים חמים',
        'שיחות שכלל תייג בזמן שהיית עסוק.',
        [
          ['עם התגית', 'ליד חם', 'tag'],
          ['', 'נכנסות בלבד', 'direction'],
        ],
      ],
    ] as [string, string, [string, string, 'intent' | 'date' | 'tag' | 'direction'][]][],
    limitsLabel: 'מגבלות הבטא החינמית',
    limits: [
      ['500', 'שיחות'],
      ['300 דק׳', 'תמלול בחודש'],
      ['50', 'שאלות ביום'],
      ['2 GB', 'גיבוי הקלטות'],
      ['3', 'מכשירים מקושרים'],
    ],
    faq: [
      [
        'האם AskCalls יכולה לקרוא את השיחות שלי?',
        'לא. התמלולים מוצפנים במכשיר שלך לפני שהם מגיעים לשרת. החריגים מפורטים בדף האבטחה.',
      ],
      [
        'מה קורה אם מאבדים את מפתח הגישה?',
        'משתמשים בקוד השחזור. בלי מפתח גישה או קוד שחזור אי אפשר לשחזר את השיחות.',
      ],
      ['זה עובד בעברית?', 'כן. החיפוש, הממשק והתמלול עובדים בעברית ובאנגלית, גם באותה שיחה.'],
    ],
    footer: [
      ['מוצר', ['איך זה עובד', 'מחירים', 'אירוח עצמי']],
      ['אמון', ['אבטחה', 'קוד מקור', 'מבחן הדליפה']],
      ['משפטי', ['פרטיות', 'תנאים', 'יצירת קשר']],
    ] as [string, string[]][],
    tagline: 'אפשר לשאול את השיחות שלך הכול.',
    demo: 'חיפוש של „מחיר” מוצא שלוש שיחות ופותח את השיחה עם דנה לוי.',
    play: 'ניגון',
    pause: 'השהיה',
  },
};

const POSTER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#EFF2F2"/><rect x="1" y="1" width="9" height="1" rx=".5" fill="#C9D1D3"/><rect x="1" y="3" width="14" height="1.6" rx=".3" fill="#fff"/><rect x="1" y="5" width="14" height="1.6" rx=".3" fill="#fff"/></svg>',
  );

export function MarketingGroup() {
  const c = useCopy(copy);
  const { lang } = useEnv();
  return (
    <>
      <Specimen name="MarketingHeader" wide>
        <div className="overflow-hidden rounded-lg border border-border">
          <MarketingHeader
            homeHref="#"
            links={c.links.map((label, i) => ({ href: `#l${i}`, label }))}
            language={
              <Select defaultValue={lang}>
                <SelectTrigger aria-label={c.language} className="h-8 w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="he">עברית</SelectItem>
                </SelectContent>
              </Select>
            }
            signIn={{ href: '#', label: c.signIn }}
            start={{ href: '#', label: c.start }}
            labels={{ brand: 'AskCalls', nav: c.nav, menu: c.menu }}
          />
        </div>
      </Specimen>
      <Specimen name="DemoFrame" note="poster and play button under reduced motion" wide>
        <DemoFrame poster={POSTER} description={c.demo} labels={{ play: c.play, pause: c.pause }} />
      </Specimen>
      <Specimen name="StepList" wide>
        <StepList steps={c.steps.map(([title, body]) => ({ key: title!, title: title!, body }))} />
      </Specimen>
      <Specimen name="UseCaseCard" note="sample searches are read-only FilterBlanks" wide>
        <div className="grid gap-6 md:grid-cols-2">
          {c.useCases.map(([title, body, sample]) => (
            <UseCaseCard
              key={title}
              title={title}
              body={body}
              sample={sample.map(([before, value, facet], i) => (
                <span key={value}>
                  {i > 0 ? ' · ' : null}
                  {before ? `${before} ` : null}
                  <FilterBlank facet={facet} empty="" value={value} readOnly />
                </span>
              ))}
            />
          ))}
        </div>
      </Specimen>
      <Specimen name="LimitsTable" wide>
        <LimitsTable
          label={c.limitsLabel}
          limits={c.limits.map(([value, label]) => ({ key: label!, value: value!, label: label! }))}
        />
      </Specimen>
      <Specimen name="FaqList" wide>
        <FaqList
          items={c.faq.map(([question, answer]) => ({
            key: question!,
            question: question!,
            answer,
          }))}
        />
      </Specimen>
      <Specimen name="MarketingFooter" wide>
        <div className="rounded-lg border border-border">
          <MarketingFooter
            brand="AskCalls"
            tagline={c.tagline}
            columns={c.footer.map(([title, links]) => ({
              title,
              links: links.map((label, i) => ({ href: `#${title}${i}`, label })),
            }))}
          />
        </div>
      </Specimen>
    </>
  );
}
