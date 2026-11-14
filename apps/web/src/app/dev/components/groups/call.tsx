'use client';

import { AskMessage } from '@askcalls/ui/components/AskMessage';
import { AskPanel } from '@askcalls/ui/components/AskPanel';
import { CallActions } from '@askcalls/ui/components/CallActions';
import { CallHeader } from '@askcalls/ui/components/CallHeader';
import { ConsentSheet } from '@askcalls/ui/components/ConsentSheet';
import { DataFlowNote } from '@askcalls/ui/components/DataFlowNote';
import { NotesEditor } from '@askcalls/ui/components/NotesEditor';
import { RecordingPlayer } from '@askcalls/ui/components/RecordingPlayer';
import { SaveStatus } from '@askcalls/ui/components/SaveStatus';
import { SignatureBadge } from '@askcalls/ui/components/SignatureBadge';
import { TimestampLink } from '@askcalls/ui/components/TimestampLink';
import { TranscriptSegment } from '@askcalls/ui/components/TranscriptSegment';
import { Button } from '@askcalls/ui/primitives/button';
import { MessageSquareText } from 'lucide-react';
import { useState } from 'react';
import { common } from '../copy';
import { sampleCalls, TRANSCRIPT } from '../samples';
import { Specimen, State, useCopy, useEnv } from '../shell';

const copy = {
  en: {
    actions: {
      whatsapp: 'Open in WhatsApp',
      callBack: 'Call back',
      noNumber: 'No phone number for this call',
      download: 'Download',
      more: 'More actions',
      delete: 'Delete call',
      deleteTitle: 'Delete this call?',
      deleteBody: 'The transcript, notes, tags and recording are deleted for good.',
      cancel: 'Cancel',
      hit: (i: number, n: number) => `Hit ${i} of ${n}`,
      previousHit: 'Previous hit',
      nextHit: 'Next hit',
    },
    formats: [
      { key: 'txt', label: 'Transcript (TXT)' },
      { key: 'srt', label: 'Subtitles (SRT)' },
    ],
    addTag: 'Tag',
    ask: 'Ask',
    sig: {
      verified: [
        'Signed by MacBook Air',
        'Your device signed this transcript when it was created, and the signature checks out.',
      ],
      'unknown-device': [
        'Signed by a device that is no longer linked',
        'The signing device was unlinked after this call was saved.',
      ],
      invalid: [
        "Signature doesn't match",
        'This transcript may have been changed after it was signed.',
      ],
      missing: [
        'Not signed: imported through the inbox',
        'Inbox imports are not signed by one of your devices.',
      ],
    },
    player: {
      play: 'Play',
      pause: 'Pause',
      back: 'Back 5 seconds',
      forward: 'Forward 5 seconds',
      position: 'Position',
      speed: 'Speed',
      of: (a: string, b: string) => `${a} of ${b}`,
      error: "Couldn't decrypt the recording",
    },
    askLabels: {
      placeholder: 'Ask about this call',
      send: 'Send',
      error: "Anthropic didn't respond. Try again.",
      quota: "You've used today's 50 questions. More at 02:00.",
      off: 'Ask is turned off.',
      retry: 'Try again',
    },
    suggestions: ['Summarize this call', 'What did I promise?', 'Next steps'],
    q1: 'Did she agree to the price?',
    a1: [
      '**Not yet.** Dana asked for:\n- a written quote by Sunday ',
      { seconds: 48 },
      '\n- a discount if she signs this month ',
      { seconds: 65 },
      '\n\nYou quoted about **₪48,000** for oak veneer with a quartz top ',
      { seconds: 26 },
      '; installation is included and delivery is ₪1,200 ',
      { seconds: 41 },
      '.',
    ],
    route: {
      compact: 'Claude Sonnet via AskCalls · sends this call to Anthropic',
      managed:
        "This call's transcript and your question go through AskCalls to Anthropic (Claude Sonnet). AskCalls doesn't store them.",
      direct:
        "This call's transcript and your question go from your device straight to Anthropic under your account. AskCalls doesn't see them.",
      passthrough:
        "This call's transcript and your question pass through AskCalls with your key to Anthropic. Nothing is stored or logged.",
      onDevice: 'Transcription runs on this device. Nothing leaves it.',
      inbox:
        "Inbox uploads are visible to the AskCalls server in transit. They're encrypted to your key on arrival and indexed next time you unlock.",
      off: 'Ask is off. No call content goes anywhere.',
      transcription:
        'Audio goes from your device straight to ElevenLabs under your account. AskCalls never sees it.',
    },
    consent: {
      title: 'Send this call to Anthropic?',
      facts: [
        'Only this call. Not your other calls, contacts or notes.',
        'Names and numbers in the transcript are included.',
        'Anthropic keeps nothing under its zero-retention terms.',
      ],
      remember: "Don't ask again until I lock AskCalls",
      change: 'Change provider: Settings → Providers',
      cancel: 'Cancel',
      send: 'Send and ask',
      open: 'Show consent',
    },
    notes: 'Notes',
    notesText: 'לשלוח הצעה כתובה עד יום ראשון. Ask about the quartz edge profile.',
    offAction: 'Settings → Providers',
  },
  he: {
    actions: {
      whatsapp: 'פתיחה בוואטסאפ',
      callBack: 'חיוג חוזר',
      noNumber: 'אין מספר טלפון לשיחה הזאת',
      download: 'הורדה',
      more: 'פעולות נוספות',
      delete: 'מחיקת השיחה',
      deleteTitle: 'למחוק את השיחה?',
      deleteBody: 'התמלול, ההערות, התגיות וההקלטה יימחקו לצמיתות.',
      cancel: 'ביטול',
      hit: (i: number, n: number) => `התאמה ${i} מתוך ${n}`,
      previousHit: 'ההתאמה הקודמת',
      nextHit: 'ההתאמה הבאה',
    },
    formats: [
      { key: 'txt', label: 'תמלול (TXT)' },
      { key: 'srt', label: 'כתוביות (SRT)' },
    ],
    addTag: 'תגית',
    ask: 'שאלה',
    sig: {
      verified: ['נחתם על ידי MacBook Air', 'המכשיר שלך חתם על התמלול כשנוצר, והחתימה תקינה.'],
      'unknown-device': ['נחתם על ידי מכשיר שכבר לא מקושר', 'המכשיר החותם נותק אחרי שהשיחה נשמרה.'],
      invalid: ['החתימה לא תואמת', 'ייתכן שהתמלול שונה אחרי שנחתם.'],
      missing: ['לא נחתם: יובא דרך התיבה', 'ייבוא דרך התיבה לא נחתם על ידי מכשיר שלך.'],
    },
    player: {
      play: 'ניגון',
      pause: 'השהיה',
      back: 'אחורה 5 שניות',
      forward: 'קדימה 5 שניות',
      position: 'מיקום',
      speed: 'מהירות',
      of: (a: string, b: string) => `${a} מתוך ${b}`,
      error: 'לא ניתן לפענח את ההקלטה',
    },
    askLabels: {
      placeholder: 'שאלה על השיחה הזאת',
      send: 'שליחה',
      error: 'Anthropic לא הגיבה. כדאי לנסות שוב.',
      quota: 'ניצלת את 50 השאלות של היום. עוד שאלות ב-02:00.',
      off: 'שאלות כבויות.',
      retry: 'ניסיון חוזר',
    },
    suggestions: ['סיכום השיחה', 'מה הבטחתי?', 'הצעדים הבאים'],
    q1: 'היא הסכימה למחיר?',
    a1: [
      '**עדיין לא.** דנה ביקשה:\n- הצעה כתובה עד יום ראשון ',
      { seconds: 48 },
      '\n- הנחה אם תחתום החודש ',
      { seconds: 65 },
      '\n\nהצעת כ-**48,000 ₪** לפורניר אלון עם משטח קוורץ ',
      { seconds: 26 },
      '; ההתקנה כלולה וההובלה 1,200 ₪ ',
      { seconds: 41 },
      '.',
    ],
    route: {
      compact: 'Claude Sonnet דרך AskCalls · השיחה נשלחת ל-Anthropic',
      managed:
        'התמלול של השיחה והשאלה שלך עוברים דרך AskCalls אל Anthropic ‏(Claude Sonnet). AskCalls לא שומרת אותם.',
      direct:
        'התמלול של השיחה והשאלה שלך יוצאים מהמכשיר שלך ישירות ל-Anthropic, תחת החשבון שלך. AskCalls לא רואה אותם.',
      passthrough:
        'התמלול של השיחה והשאלה שלך עוברים דרך AskCalls עם המפתח שלך אל Anthropic. דבר לא נשמר ולא נרשם.',
      onDevice: 'התמלול רץ במכשיר הזה. שום דבר לא יוצא ממנו.',
      inbox:
        'העלאות לתיבה גלויות לשרת AskCalls בזמן המעבר. הן מוצפנות למפתח שלך כשהן מגיעות ונוספות לאינדקס בפעם הבאה שהנעילה מבוטלת.',
      off: 'שאלות כבויות. תוכן השיחות לא נשלח לשום מקום.',
      transcription:
        'השמע יוצא מהמכשיר שלך ישירות ל-ElevenLabs, תחת החשבון שלך. AskCalls לא רואה אותו.',
    },
    consent: {
      title: 'לשלוח את השיחה הזאת ל-Anthropic?',
      facts: [
        'רק השיחה הזאת. לא שיחות אחרות, אנשי קשר או הערות.',
        'שמות ומספרים שבתמלול נכללים.',
        'Anthropic לא שומרת דבר לפי תנאי אי-השמירה שלה.',
      ],
      remember: 'לא לשאול שוב עד שאנעל את AskCalls',
      change: 'החלפת ספק: הגדרות ← ספקים',
      cancel: 'ביטול',
      send: 'שליחה ושאלה',
      open: 'הצגת בקשת ההסכמה',
    },
    notes: 'הערות',
    notesText: 'לשלוח הצעה כתובה עד יום ראשון. Ask about the quartz edge profile.',
    offAction: 'הגדרות ← ספקים',
  },
};

export function CallViewGroup() {
  const { lang, locale } = useEnv();
  const c = useCopy(copy);
  const k = useCopy(common);
  const call = sampleCalls(lang)[0]!;
  const [starred, setStarred] = useState(true);
  const [question, setQuestion] = useState('');
  const [consent, setConsent] = useState(false);
  const [remember, setRemember] = useState(false);
  const [notes, setNotes] = useState(c.notesText);
  const headerLabels = { ...k, addTag: c.addTag, decrypting: k.decrypting };
  const nodes = { device: k.device, server: k.server, provider: 'Anthropic' };
  const actions = (phone?: string, hits?: boolean) => (
    <CallActions
      phone={phone}
      downloadFormats={c.formats}
      onDownload={() => {}}
      onDelete={() => {}}
      hits={hits ? { index: 2, count: 5, onPrevious: () => {}, onNext: () => {} } : undefined}
      askButton={
        <Button variant="secondary" size="sm">
          <MessageSquareText className="size-4" aria-hidden />
          {c.ask}
        </Button>
      }
      labels={c.actions}
    />
  );
  const sig = (s: keyof typeof c.sig) => ({ status: s, label: c.sig[s][0]!, detail: c.sig[s][1]! });
  const speaker = (s: string) => (s === 'you' ? k.you : 'דנה לוי');
  return (
    <>
      <Specimen name="CallHeader" note="loaded, with CallActions" wide>
        <CallHeader
          call={{ ...call, starred }}
          signature={sig('verified')}
          locale={locale}
          onStarredChange={setStarred}
          onAddTag={() => {}}
          actions={actions(call.phone)}
          labels={headerLabels}
        />
      </Specimen>
      <Specimen name="CallHeader" note="locked (decrypting)">
        <CallHeader
          call="locked"
          signature={sig('verified')}
          locale={locale}
          onStarredChange={() => {}}
          onAddTag={() => {}}
          actions={null}
          labels={headerLabels}
        />
      </Specimen>
      <Specimen name="SignatureBadge">
        <div className="flex flex-col items-start gap-2">
          {(['verified', 'unknown-device', 'invalid', 'missing'] as const).map((s) => (
            <SignatureBadge key={s} {...sig(s)} />
          ))}
        </div>
      </Specimen>
      <Specimen
        name="CallActions"
        note="no number: WhatsApp and Call back explain why · hit navigation"
        wide
      >
        {actions(undefined, true)}
      </Specimen>
      <Specimen
        name="TranscriptSegment"
        note="Hebrew and English turns · playing · hits · grouped"
        wide
      >
        <ol className="m-0 flex max-w-transcript list-none flex-col gap-1 p-0">
          {TRANSCRIPT.map((t, i) => (
            <TranscriptSegment
              key={t.start}
              speaker={speaker(t.speaker)}
              isYou={t.speaker === 'you'}
              start={t.start}
              text={t.text}
              hits={['מחיר', 'price']}
              playing={t.start === 26}
              groupedWithPrevious={i > 0 && TRANSCRIPT[i - 1]?.speaker === t.speaker}
              onSeek={() => {}}
              playFromLabel={k.playFrom(`0:${String(t.start).padStart(2, '0')}`)}
            />
          ))}
        </ol>
      </Specimen>
      <Specimen name="RecordingPlayer" note="always LTR; hit ticks">
        <State label="ready">
          <RecordingPlayer
            durationSec={492}
            defaultTime={29}
            hits={[15, 35, 48]}
            state="ready"
            src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA="
            locale={locale}
            labels={c.player}
          />
        </State>
        <State label="decrypting">
          <RecordingPlayer durationSec={492} state="decrypting" locale={locale} labels={c.player} />
        </State>
        <State label="error">
          <RecordingPlayer durationSec={492} state="error" locale={locale} labels={c.player} />
        </State>
      </Specimen>
      <Specimen name="TimestampLink">
        <div className="flex items-center gap-4">
          <TimestampLink seconds={48} onSeek={() => {}} a11yLabel={k.playFrom('0:48')} />
          <TimestampLink
            seconds={65}
            context="citation"
            onSeek={() => {}}
            a11yLabel={k.playFrom('1:05')}
          />
          <TimestampLink
            seconds={125}
            onSeek={() => {}}
            a11yLabel={k.playFrom('2:05')}
            noRecordingHint={k.noRecording}
          />
        </div>
      </Specimen>
      <Specimen name="AskPanel" note="conversation, streaming answer, suggestions">
        <div className="h-136 overflow-hidden rounded-lg border border-border bg-card">
          <AskPanel
            enabled
            messages={[
              { id: 'q1', kind: 'question', parts: [c.q1] },
              { id: 'a1', kind: 'answer', author: 'Claude Sonnet', parts: c.a1 },
              { id: 'q2', kind: 'question', parts: ['מה ההנחה שהבטחתי?'] },
              {
                id: 'a2',
                kind: 'answer',
                author: 'Claude Sonnet',
                parts: [
                  'הבטחת הנחה של 5% אם היא חותמת עד סוף החודש ',
                  { seconds: 69 },
                  ', ואמרת שתכתוב',
                ],
                streaming: true,
              },
            ]}
            onSeek={() => {}}
            suggestions={c.suggestions}
            value={question}
            onChange={setQuestion}
            onSend={() => setConsent(true)}
            dataFlow={
              <DataFlowNote route="managed" size="compact" nodes={nodes}>
                {c.route.compact}
              </DataFlowNote>
            }
            labels={{ ...c.askLabels, playFrom: k.playFrom }}
          />
        </div>
      </Specimen>
      <div className="flex flex-col gap-12">
        <Specimen name="AskPanel" note="error · quota · off">
          <State label="error">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <AskPanel
                enabled
                messages={[]}
                onSeek={() => {}}
                value=""
                onChange={() => {}}
                onSend={() => {}}
                state="error"
                onRetry={() => {}}
                dataFlow={
                  <DataFlowNote route="managed" size="compact" nodes={nodes}>
                    {c.route.compact}
                  </DataFlowNote>
                }
                labels={{ ...c.askLabels, playFrom: k.playFrom }}
              />
            </div>
          </State>
          <State label="quota">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <AskPanel
                enabled
                messages={[]}
                onSeek={() => {}}
                value=""
                onChange={() => {}}
                onSend={() => {}}
                state="quota"
                dataFlow={
                  <DataFlowNote route="managed" size="compact" nodes={nodes}>
                    {c.route.compact}
                  </DataFlowNote>
                }
                labels={{ ...c.askLabels, playFrom: k.playFrom }}
              />
            </div>
          </State>
          <State label="off">
            <div className="rounded-lg border border-border bg-card">
              <AskPanel
                enabled={false}
                messages={[]}
                onSeek={() => {}}
                value=""
                onChange={() => {}}
                onSend={() => {}}
                dataFlow={null}
                labels={{ ...c.askLabels, playFrom: k.playFrom }}
                offAction={<Button variant="outline">{c.offAction}</Button>}
              />
            </div>
          </State>
        </Specimen>
        <Specimen name="AskMessage">
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
            <AskMessage kind="question" parts={[c.q1]} />
            <AskMessage
              kind="answer"
              author="Claude Sonnet"
              parts={c.a1.slice(0, 3)}
              playFromLabel={k.playFrom}
            />
          </div>
        </Specimen>
      </div>
      <Specimen
        name="ConsentSheet"
        note="Dialog on desktop, bottom sheet on phones; focus starts on Send and ask"
      >
        <Button
          variant="outline"
          className="self-start"
          onClick={() => setConsent(true)}
          id="open-consent"
        >
          {c.consent.open}
        </Button>
        <ConsentSheet
          open={consent}
          onOpenChange={setConsent}
          title={c.consent.title}
          route="managed"
          dataFlow={c.route.managed}
          nodes={nodes}
          facts={c.consent.facts}
          remember={remember}
          onRememberChange={setRemember}
          onSend={() => setConsent(false)}
          labels={c.consent}
        />
      </Specimen>
      <Specimen name="DataFlowNote" note="every route · compact" wide>
        <div className="grid gap-3 md:grid-cols-2">
          <State label="managed">
            <DataFlowNote route="managed" nodes={nodes}>
              {c.route.managed}
            </DataFlowNote>
          </State>
          <State label="direct">
            <DataFlowNote route="direct" nodes={{ ...nodes, provider: 'ElevenLabs' }}>
              {c.route.transcription}
            </DataFlowNote>
          </State>
          <State label="passthrough">
            <DataFlowNote route="passthrough" nodes={nodes}>
              {c.route.passthrough}
            </DataFlowNote>
          </State>
          <State label="on-device">
            <DataFlowNote route="on-device" nodes={nodes}>
              {c.route.onDevice}
            </DataFlowNote>
          </State>
          <State label="inbox">
            <DataFlowNote route="inbox" nodes={{ ...nodes, source: 'Claude' }}>
              {c.route.inbox}
            </DataFlowNote>
          </State>
          <State label="off">
            <DataFlowNote route="off" nodes={nodes}>
              {c.route.off}
            </DataFlowNote>
          </State>
          <State label="compact">
            <DataFlowNote route="managed" size="compact" nodes={nodes}>
              {c.route.compact}
            </DataFlowNote>
          </State>
        </div>
      </Specimen>
      <Specimen name="NotesEditor">
        <NotesEditor
          value={notes}
          onChange={setNotes}
          label={c.notes}
          save={{ state: 'saved' }}
          saveLabels={k.save}
        />
      </Specimen>
      <Specimen name="SaveStatus">
        <div className="flex flex-wrap gap-5">
          <SaveStatus state="saving" labels={k.save} />
          <SaveStatus state="saved" labels={k.save} />
          <SaveStatus state="error" labels={k.save} onRetry={() => {}} />
        </div>
      </Specimen>
    </>
  );
}
