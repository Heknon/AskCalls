'use client';

import { DataFlowNote } from '@askcalls/ui/components/DataFlowNote';
import { FileDropZone } from '@askcalls/ui/components/FileDropZone';
import { JobProgress } from '@askcalls/ui/components/JobProgress';
import { PreflightSummary } from '@askcalls/ui/components/PreflightSummary';
import { QueueItemStatus, type QueueState } from '@askcalls/ui/components/QueueItemStatus';
import { QueueRow } from '@askcalls/ui/components/QueueRow';
import { UsageMeter } from '@askcalls/ui/components/UsageMeter';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import { TableHead } from '@askcalls/ui/primitives/table';
import { useState } from 'react';
import { common } from '../copy';
import { Specimen, State, useCopy, useEnv } from '../shell';

const copy = {
  en: {
    drop: {
      title: 'Drop files, a folder or a ZIP',
      browse: 'Choose files',
      folder: 'Choose a folder',
      hint: 'M4A, MP3, WAV, OGG, AMR · TXT, SRT, VTT, JSON',
    },
    manifest: {
      title: 'Drop a manifest CSV',
      browse: 'Choose a CSV',
      hint: 'Columns: file, phone, name, date',
    },
    states: {
      queued: 'Queued',
      decoding: 'Decoding',
      transcribing: 'Transcribing',
      indexing: 'Indexing',
      encrypting: 'Encrypting',
      uploading: 'Uploading',
      done: 'Done',
      duplicate: 'Duplicate',
      failed: 'Failed',
    } as Record<QueueState, string>,
    reason: "Couldn't read this file. It may be damaged.",
    parts: { audio: 'Audio', transcript: 'Transcript' },
    head: ['File', 'Contact', 'Status', ''],
    dupOf: 'Same as the call on 12 Nov, 14:32',
    retry: 'Retry',
    summary: 'Import summary',
    counts: [
      'audio only, will be transcribed',
      'audio with transcript',
      'transcript only',
      'likely duplicates, skipped',
    ],
    usageLabel: 'Transcription this month, after this import',
    min: 'min',
    note: 'About 214 minutes of audio to transcribe. manifest.csv set names and dates for 41 files.',
    flow: 'Audio passes through AskCalls to ElevenLabs Scribe v2, streamed and not stored. ElevenLabs may keep request logs under its standard policy.',
    backup: 'Back up recordings',
    job: '38 of 138 files done. 6 in progress, 2 failed, 4 duplicates skipped. About 35 min left.',
    paused: 'Import paused: 38 of 138 done.',
    rules: 'Applying to existing calls: 136 of 212',
    jobLabels: { pause: 'Pause', resume: 'Resume', stop: 'Stop', progress: 'Import progress' },
    meters: [
      ['Managed transcription this month', 41, 300, 'min'],
      ['Recording storage', 1.7, 2, 'GB'],
      ['Calls', 500, 500, 'calls'],
    ] as [string, number, number, string][],
  },
  he: {
    drop: {
      title: 'גרירת קבצים, תיקייה או ZIP',
      browse: 'בחירת קבצים',
      folder: 'בחירת תיקייה',
      hint: 'M4A, MP3, WAV, OGG, AMR · TXT, SRT, VTT, JSON',
    },
    manifest: {
      title: 'גרירת קובץ CSV מלווה',
      browse: 'בחירת CSV',
      hint: 'עמודות: file, phone, name, date',
    },
    states: {
      queued: 'בתור',
      decoding: 'מפענח שמע',
      transcribing: 'מתמלל',
      indexing: 'מאנדקס',
      encrypting: 'מצפין',
      uploading: 'מעלה',
      done: 'הושלם',
      duplicate: 'כפילות',
      failed: 'נכשל',
    } as Record<QueueState, string>,
    reason: 'לא ניתן לקרוא את הקובץ. ייתכן שהוא פגום.',
    parts: { audio: 'שמע', transcript: 'תמלול' },
    head: ['קובץ', 'איש קשר', 'מצב', ''],
    dupOf: 'זהה לשיחה מ-12 בנוב׳, 14:32',
    retry: 'ניסיון חוזר',
    summary: 'סיכום הייבוא',
    counts: ['שמע בלבד, יתומללו', 'שמע עם תמלול', 'תמלול בלבד', 'כפילויות אפשריות, ידולגו'],
    usageLabel: 'תמלול החודש, אחרי הייבוא',
    min: 'דק׳',
    note: 'כ-214 דקות שמע לתמלול. manifest.csv קבע שמות ותאריכים ל-41 קבצים.',
    flow: 'השמע עובר דרך AskCalls אל ElevenLabs Scribe v2, בזרימה ובלי שמירה. ElevenLabs עשויה לשמור יומני בקשות לפי המדיניות הרגילה שלה.',
    backup: 'גיבוי הקלטות',
    job: '38 מתוך 138 קבצים הושלמו. 6 בתהליך, 2 נכשלו, 4 כפילויות דולגו. נותרו כ-35 דקות.',
    paused: 'הייבוא הושהה: 38 מתוך 138 הושלמו.',
    rules: 'מחיל על שיחות קיימות: 136 מתוך 212',
    jobLabels: { pause: 'השהיה', resume: 'המשך', stop: 'עצירה', progress: 'התקדמות הייבוא' },
    meters: [
      ['תמלול מנוהל החודש', 41, 300, 'דק׳'],
      ['אחסון הקלטות', 1.7, 2, 'GB'],
      ['שיחות', 500, 500, 'שיחות'],
    ] as [string, number, number, string][],
  },
};

export function UploadGroup() {
  const c = useCopy(copy);
  const k = useCopy(common);
  const { locale, lang } = useEnv();
  const [backup, setBackup] = useState(true);
  const [paused, setPaused] = useState(false);
  const rows: {
    file: string;
    parts: string[];
    name?: string;
    phone?: string;
    state: QueueState;
    progress?: number;
  }[] = [
    {
      file: '2026-11-12_1432_+972525550134.m4a',
      parts: [c.parts.audio, c.parts.transcript],
      name: 'דנה לוי',
      state: 'done',
    },
    {
      file: 'Call with Yossi Mizrahi 2026-11-11.m4a',
      parts: [c.parts.audio],
      name: lang === 'he' ? 'יוסי מזרחי' : 'Yossi Mizrahi',
      state: 'transcribing',
      progress: 42,
    },
    {
      file: 'רשומה 0199.amr',
      parts: [c.parts.audio],
      phone: '+97235550199',
      state: 'uploading',
      progress: 80,
    },
    {
      file: 'export/maya-cohen.srt',
      parts: [c.parts.transcript],
      name: 'Maya Cohen',
      state: 'duplicate',
    },
    { file: 'voice-note-corrupt.ogg', parts: [c.parts.audio], state: 'failed' },
    { file: 'IMG_0412.m4a', parts: [c.parts.audio], state: 'queued' },
  ];
  return (
    <>
      <Specimen name="FileDropZone">
        <State label="audio and transcripts, folder picker">
          <FileDropZone
            accept="audio+transcript"
            multiple
            directory
            onFiles={() => {}}
            labels={c.drop}
          />
        </State>
        <State label="manifest">
          <FileDropZone accept="manifest" onFiles={() => {}} labels={c.manifest} />
        </State>
      </Specimen>
      <Specimen name="PreflightSummary">
        <PreflightSummary
          title={c.summary}
          locale={locale}
          counts={[61, 58, 19, 4].map((n, i) => ({ n, label: c.counts[i]! }))}
          usage={
            <UsageMeter label={c.usageLabel} used={255} limit={300} unit={c.min} locale={locale} />
          }
          note={c.note}
          dataFlow={
            <DataFlowNote
              route="managed"
              nodes={{ device: k.device, server: k.server, provider: 'ElevenLabs' }}
            >
              {c.flow}
            </DataFlowNote>
          }
          backup={{ checked: backup, onChange: setBackup, label: c.backup }}
        />
      </Specimen>
      <Specimen name="QueueRow" note="table on desktop, cards on phones" wide>
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead className="max-md:hidden">
              <tr>
                {c.head.map((h) => (
                  <TableHead key={h || 'act'}>{h}</TableHead>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <QueueRow
                  key={r.file}
                  fileName={r.file}
                  parts={r.parts}
                  contact={
                    r.name || r.phone
                      ? { name: r.name, phone: r.phone, hiddenLabel: k.hiddenNumber }
                      : undefined
                  }
                  status={{
                    state: r.state,
                    label: c.states[r.state],
                    progress: r.progress,
                    reason: r.state === 'failed' ? c.reason : undefined,
                  }}
                  duplicateOf={
                    r.state === 'duplicate' ? (
                      <Button variant="link" className="text-xs">
                        {c.dupOf}
                      </Button>
                    ) : undefined
                  }
                  retry={r.state === 'failed' ? { label: c.retry, onRetry: () => {} } : undefined}
                />
              ))}
            </tbody>
          </table>
        </Card>
      </Specimen>
      <Specimen name="QueueItemStatus" note="every state">
        <div className="flex flex-wrap gap-3">
          {(Object.keys(c.states) as QueueState[]).map((s) => (
            <QueueItemStatus
              key={s}
              state={s}
              label={c.states[s]}
              progress={s === 'transcribing' ? 42 : undefined}
              reason={s === 'failed' ? c.reason : undefined}
            />
          ))}
        </div>
      </Specimen>
      <Specimen name="JobProgress">
        <State label="running (pause) / paused (resume)">
          <JobProgress
            done={paused ? 38 : 43}
            total={138}
            label={paused ? c.paused : c.job}
            paused={paused}
            onPause={() => setPaused(true)}
            onResume={() => setPaused(false)}
            labels={c.jobLabels}
          />
        </State>
        <State label="stoppable (rules)">
          <JobProgress
            done={136}
            total={212}
            label={c.rules}
            onStop={() => {}}
            labels={c.jobLabels}
          />
        </State>
      </Specimen>
      <Specimen name="UsageMeter" note="under 80 % · warning at 80 % · destructive at 100 %">
        {c.meters.map(([label, used, limit, unit]) => (
          <UsageMeter
            key={label}
            label={label}
            used={used}
            limit={limit}
            unit={unit}
            locale={locale}
          />
        ))}
      </Specimen>
    </>
  );
}
