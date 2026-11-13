'use client';

import type { FailureReason } from '@askcalls/client-core/errors';
import { type ActiveStatus, type IngestResult, ingestCall } from '@askcalls/client-core/ingest';
import type { Contact, Settings } from '@askcalls/client-core/userdata';
import type { CallDirection } from '@askcalls/domain';
import { DEFAULT_PHONE_REGION, isPhoneRegion } from '@askcalls/indexing';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { FileDropZone } from '@askcalls/ui/components/FileDropZone';
import { QueueItemStatus } from '@askcalls/ui/components/QueueItemStatus';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import { Input } from '@askcalls/ui/primitives/input';
import { Label } from '@askcalls/ui/primitives/label';
import { Switch } from '@askcalls/ui/primitives/switch';
import { ToggleGroup, ToggleGroupItem } from '@askcalls/ui/primitives/toggle-group';
import { FileAudio, FileText, Phone, PhoneIncoming, PhoneOutgoing, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { useAppSession } from '../../../../../../client/session/session';
import { failureKey, minutesLeft, type TranscriptionFlow, type TranslationFlow } from './plan';
import {
  contactFor,
  defaultsFor,
  fromLocalInput,
  type Picked,
  phoneValid,
  pickFiles,
  type SingleForm,
} from './single';
import { TranscriptionNote, TranslationNote } from './transcription-note';

const STEPS: ActiveStatus[] = [
  'decoding',
  'transcribing',
  'translating',
  'indexing',
  'encrypting',
  'uploading',
];

type Run =
  | { state: 'idle' }
  | { state: 'running'; step: ActiveStatus | null }
  | { state: 'finished'; result: IngestResult; lastStep: ActiveStatus | null };

export interface SingleUploadProps {
  flow: TranscriptionFlow;
  translation: TranslationFlow;
  settings: Settings;
  contacts: readonly Contact[];
  recordingsOff: boolean;
}

/** U1: one call from audio and/or a transcript, with its number, time and direction confirmed. */
export function SingleUpload({
  flow,
  translation,
  settings,
  contacts,
  recordingsOff,
}: SingleUploadProps) {
  const t = useTranslations('upload');
  const { client, me, refreshMe } = useAppSession();
  const id = useId();
  const region = isPhoneRegion(settings.phoneRegion) ? settings.phoneRegion : DEFAULT_PHONE_REGION;
  const [picked, setPicked] = useState<Picked>({ audio: null, transcript: null });
  const [unsupported, setUnsupported] = useState(false);
  const [form, setForm] = useState<SingleForm | null>(null);
  const [backup, setBackup] = useState(settings.backupRecordings);
  const [run, setRun] = useState<Run>({ state: 'idle' });

  if (!client || !me) return null;

  const onFiles = (files: File[]) => {
    const next = pickFiles(picked, files);
    setUnsupported(next.unsupported);
    if (!next.picked.audio && !next.picked.transcript) return;
    setPicked(next.picked);
    setForm(
      (f) =>
        f ??
        defaultsFor(next.picked, {
          region,
          contacts,
          utcOffsetMinutes: -new Date().getTimezoneOffset(),
        }),
    );
  };
  const removeFile = (kind: keyof Picked) => {
    const next = { ...picked, [kind]: null };
    setPicked(next);
    if (!next.audio && !next.transcript) setForm(null);
  };
  const reset = () => {
    setPicked({ audio: null, transcript: null });
    setForm(null);
    setUnsupported(false);
    setRun({ state: 'idle' });
  };

  const needsTranscription = !!picked.audio && !picked.transcript;
  const left = minutesLeft(me, flow);
  const blocker = !needsTranscription
    ? null
    : flow.route === 'off'
      ? t('txOff')
      : left === 0
        ? t('quota')
        : null;
  const callLimit = me.usage.calls >= me.limits.maxCalls;
  const validPhone = form ? phoneValid(form.phone, region) : true;

  const upload = async () => {
    if (!form) return;
    let step: ActiveStatus | null = null;
    setRun({ state: 'running', step: null });
    const transcript = picked.transcript
      ? new Uint8Array(await picked.transcript.arrayBuffer())
      : undefined;
    const startedAt = fromLocalInput(form.startedAt);
    const result = await ingestCall(
      client.ctx,
      {
        source: 'app',
        ...(picked.audio && { audio: picked.audio }),
        ...(transcript && { transcript, transcriptFileName: picked.transcript!.name }),
        sourceFileName: (picked.audio ?? picked.transcript)!.name,
        meta: {
          phone: form.phone.trim() || null,
          startedAt,
          direction: form.direction,
          contactName: form.contactName.trim() || null,
        },
        backupRecording: backup && !!picked.audio && !recordingsOff,
      },
      {
        onStatus: (s) => {
          step = s;
          setRun({ state: 'running', step: s });
        },
      },
    );
    setRun({ state: 'finished', result, lastStep: step });
    if (result.status === 'done') refreshMe().catch(() => {});
  };

  if (run.state === 'finished') {
    return <SingleResult run={run} onAnother={reset} onRetry={upload} />;
  }

  const running = run.state === 'running';
  const field = (k: keyof SingleForm) => `${id}-${k}`;
  const set = <K extends keyof SingleForm>(k: K, v: SingleForm[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="flex flex-col gap-6">
      {running ? null : (
        <FileDropZone
          accept="audio+transcript"
          multiple
          onFiles={onFiles}
          labels={{ title: t('drop'), browse: t('choose'), hint: t('formats') }}
        />
      )}
      {picked.audio || picked.transcript ? (
        <Card className="flex flex-col gap-1 px-4 py-2">
          {(['audio', 'transcript'] as const).map((kind) => {
            const f = picked[kind];
            if (!f) return null;
            const Icon = kind === 'audio' ? FileAudio : FileText;
            return (
              <div key={kind} className="flex items-center gap-3 py-1">
                <Icon className="size-4 shrink-0" aria-hidden />
                <bdi dir="ltr" title={f.name} className="min-w-0 flex-1 truncate font-mono text-sm">
                  {f.name}
                </bdi>
                <span className="text-muted-foreground text-sm">{t(`parts.${kind}`)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('removeFile', { name: f.name })}
                  disabled={running}
                  onClick={() => removeFile(kind)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            );
          })}
        </Card>
      ) : null}
      {unsupported ? <ErrorState scope="inline" title={t('unsupported')} /> : null}

      {form ? (
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void upload();
          }}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field('phone')}>{t('phone')}</Label>
              <Input
                id={field('phone')}
                dir="ltr"
                inputMode="tel"
                autoComplete="off"
                value={form.phone}
                aria-invalid={!validPhone || undefined}
                aria-describedby={`${field('phone')}-hint`}
                disabled={running}
                onChange={(e) => {
                  const phone = e.target.value;
                  setForm((f) => {
                    if (!f) return f;
                    const known = contactFor(contacts, phone, region);
                    return {
                      ...f,
                      phone,
                      contactName: known && !f.contactName ? known.name : f.contactName,
                    };
                  });
                }}
              />
              {validPhone ? (
                <p id={`${field('phone')}-hint`} className="text-muted-foreground text-sm">
                  {t('phoneHint')}
                </p>
              ) : (
                <span id={`${field('phone')}-hint`}>
                  <ErrorState scope="inline" title={t('badNumber')} />
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field('contactName')}>{t('contact')}</Label>
              <Input
                id={field('contactName')}
                dir="auto"
                list={`${field('contactName')}-list`}
                autoComplete="off"
                value={form.contactName}
                disabled={running}
                onChange={(e) => set('contactName', e.target.value)}
              />
              <datalist id={`${field('contactName')}-list`}>
                {contacts.map((c) => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={field('startedAt')}>{t('date')}</Label>
              <Input
                id={field('startedAt')}
                type="datetime-local"
                value={form.startedAt}
                disabled={running}
                onChange={(e) => set('startedAt', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label id={field('direction')}>{t('direction.label')}</Label>
              <ToggleGroup
                type="single"
                aria-labelledby={field('direction')}
                value={form.direction}
                disabled={running}
                onValueChange={(v) => v && set('direction', v as CallDirection)}
                className="w-full"
              >
                <ToggleGroupItem value="in">
                  <PhoneIncoming aria-hidden />
                  {t('direction.in')}
                </ToggleGroupItem>
                <ToggleGroupItem value="out">
                  <PhoneOutgoing aria-hidden />
                  {t('direction.out')}
                </ToggleGroupItem>
                <ToggleGroupItem value="unknown">
                  <Phone aria-hidden />
                  {t('direction.unknown')}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
          {picked.audio && !recordingsOff ? (
            <div className="flex items-center gap-2.5">
              <Switch
                id={`${id}-backup`}
                checked={backup}
                disabled={running}
                onCheckedChange={setBackup}
              />
              <Label htmlFor={`${id}-backup`} className="font-normal">
                {t('backup')}
              </Label>
            </div>
          ) : null}
          {needsTranscription ? <TranscriptionNote flow={flow} /> : null}
          <TranslationNote flow={translation} />
          {blocker ? <ErrorState scope="inline" title={blocker} /> : null}
          {callLimit ? (
            <ErrorState scope="inline" title={t('callLimit', { n: me.limits.maxCalls })} />
          ) : null}
          {running ? (
            <Steps
              steps={STEPS.filter((s) => s !== 'transcribing' || needsTranscription)
                .filter((s) => s !== 'translating' || translation.route !== 'off')
                .filter((s) => s !== 'decoding' || !!picked.audio)}
              current={run.step}
            />
          ) : (
            <div>
              <Button
                type="submit"
                variant="primary"
                disabled={!validPhone || !!blocker || callLimit}
              >
                {t('cta')}
              </Button>
            </div>
          )}
        </form>
      ) : null}
    </div>
  );
}

/** The pipeline as a row of steps: finished ones done, the current one working. */
function Steps({ steps, current }: { steps: ActiveStatus[]; current: ActiveStatus | null }) {
  const t = useTranslations('upload');
  const at = current ? steps.indexOf(current) : -1;
  return (
    <ol aria-label={t('steps')} className="flex flex-wrap gap-2">
      {steps.map((s, i) => (
        <li key={s}>
          <QueueItemStatus
            state={i < at ? 'done' : i === at ? s : 'queued'}
            label={t(`queue.${s}`)}
          />
        </li>
      ))}
    </ol>
  );
}

function SingleResult({
  run,
  onAnother,
  onRetry,
}: {
  run: Extract<Run, { state: 'finished' }>;
  onAnother: () => void;
  onRetry: () => void;
}) {
  const t = useTranslations('upload');
  const { result } = run;
  if (result.status === 'failed') {
    return (
      <div className="flex flex-col items-start gap-4">
        <QueueItemStatus
          state="failed"
          label={t('queue.failed')}
          reason={t(failureKey(result.reason as FailureReason, run.lastStep) as 'reason.unknown')}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={onRetry}>
            {t('bulk.retry')}
          </Button>
          <Button variant="outline" onClick={onAnother}>
            {t('another')}
          </Button>
        </div>
      </div>
    );
  }
  const duplicate = result.status === 'duplicate';
  const callId = duplicate ? result.existingId : result.callId;
  return (
    <div className="flex flex-col items-start gap-4" aria-live="polite">
      <QueueItemStatus
        state={duplicate ? 'duplicate' : 'done'}
        label={duplicate ? t('dup.title') : t('done')}
      />
      {result.status === 'done' && result.recording === 'failed' ? (
        <ErrorState scope="inline" title={t('recordingFailed')} />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" asChild>
          <Link href={`/app/calls/${callId}`}>{duplicate ? t('dup.open') : t('open')}</Link>
        </Button>
        <Button variant="outline" onClick={onAnother}>
          {t('another')}
        </Button>
      </div>
    </div>
  );
}
