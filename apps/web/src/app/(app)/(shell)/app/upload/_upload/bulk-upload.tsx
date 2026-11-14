'use client';

import type { FileRef } from '@askcalls/client-core/bulk/pairing';
import type { BulkItemState } from '@askcalls/client-core/bulk/queue';
import { timeZones } from '@askcalls/client-core/bulk/time-zone';
import { getCall } from '@askcalls/client-core/calls';
import type { Contact, Settings } from '@askcalls/client-core/userdata';
import { callStartedAt } from '@askcalls/domain';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { FileDropZone } from '@askcalls/ui/components/FileDropZone';
import { JobProgress } from '@askcalls/ui/components/JobProgress';
import { PreflightSummary } from '@askcalls/ui/components/PreflightSummary';
import { QueueRow } from '@askcalls/ui/components/QueueRow';
import { StatusBanner } from '@askcalls/ui/components/StatusBanner';
import { UsageMeter } from '@askcalls/ui/components/UsageMeter';
import { formatDateTime } from '@askcalls/ui/lib/dates';
import { formatDuration } from '@askcalls/ui/lib/format';
import { Badge } from '@askcalls/ui/primitives/badge';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import { Spinner } from '@askcalls/ui/primitives/spinner';
import { Tabs, TabsList, TabsTrigger } from '@askcalls/ui/primitives/tabs';
import { ChevronDown, FileSpreadsheet, Info, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { supportsDirectoryPicker } from '../../../../../../client/adapters/bulk-files';
import { type Me, useAppSession } from '../../../../../../client/session/session';
import { intlLocale } from '../../../../../../i18n/locales';
import { type BulkController, bulkController, type QueueView } from './bulk-controller';
import {
  failureKey,
  minutesLeft,
  quotaWarnings,
  type TranscriptionFlow,
  type TranslationFlow,
} from './plan';
import { contactOf, PAGE, parts, QueueTable, ShowMore } from './queue-parts';
import { selectionSummary } from './selection';
import { TranscriptionNote, TranslationNote } from './transcription-note';
import { useWakeLock } from './use-wake-lock';

/** Loaded with the screen that shows them: neither is needed at first paint. */
const ReviewTable = lazy(() => import('./review-table').then((m) => ({ default: m.ReviewTable })));
const Guide = lazy(() => import('./format-guide').then((m) => ({ default: m.Guide })));
/** Shares the review table's chunk: one fewer chunk for every page's loader to know about. */
const EmptyCallDialog = lazy(() =>
  import('./review-table').then((m) => ({ default: m.EmptyCallDialog })),
);

const isEmptyRecording = (i: BulkItemState) =>
  i.status === 'failed' && i.reason === 'transcript_empty' && i.audio !== null;

/** The session's bulk import, created on first use and kept across screens until lock. */
export function useBulk(): BulkController {
  const { client, refreshMe } = useAppSession();
  const last = useRef(0);
  const refresh = useRef(refreshMe);
  refresh.current = refreshMe;
  const controller = bulkController(client!, () => {
    const now = Date.now();
    if (now - last.current < 2_000) return;
    last.current = now;
    refresh.current().catch(() => {});
  });
  useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return controller;
}

export interface BulkUploadProps {
  flow: TranscriptionFlow;
  translation: TranslationFlow;
  settings: Settings;
  contacts: readonly Contact[];
  recordingsOff: boolean;
}

/** U2: a folder, files or a ZIP, then the pre-flight summary, then the queue. */
export function BulkUpload({
  flow,
  translation,
  settings,
  contacts,
  recordingsOff,
}: BulkUploadProps) {
  const t = useTranslations('upload.bulk');
  const tu = useTranslations('upload');
  const controller = useBulk();
  const snap = controller.getSnapshot();
  const { me } = useAppSession();
  const [backup, setBackup] = useState(settings.backupRecordings && !recordingsOff);
  const [folderPicker, setFolderPicker] = useState(false);
  useEffect(() => setFolderPicker(supportsDirectoryPicker()), []);
  if (!me) return null;

  const drop = (
    <FileDropZone
      accept="audio+transcript"
      multiple
      directory
      onFiles={(files) => void controller.addFiles(files)}
      {...(folderPicker && { onPickFolder: () => void controller.pickFolder() })}
      labels={{
        title: t('drop'),
        browse: t('chooseFiles'),
        folder: t('chooseFolder'),
        hint: tu('formats'),
      }}
    />
  );

  if (snap.phase === 'loading') return <PlanningState />;
  if (snap.phase === 'empty') {
    return (
      <div className="flex flex-col gap-4">
        {drop}
        {snap.error ? <ErrorState scope="inline" title={t(snap.error)} /> : null}
        <Suspense fallback={null}>
          <Guide />
        </Suspense>
      </div>
    );
  }
  if (snap.phase === 'planning') return <PlanningState />;
  if (snap.phase === 'preflight') {
    const { plan, excluded } = snap;
    const sel = selectionSummary(plan.pairing.items, plan.summary, plan.manifestKeys, excluded);
    const timed = plan.pairing.items.some(
      (i) => plan.meta.get(i.key)?.startedAt && plan.edits.get(i.key)?.startedAt === undefined,
    );
    return (
      <Layout
        side={
          <Summary
            me={me}
            flow={flow}
            translation={translation}
            counts={sel}
            minutes={sel.minutes}
            manifestCovered={sel.manifestCovered}
            unreadable={sel.unreadable}
            backup={recordingsOff ? undefined : { checked: backup, onChange: setBackup }}
            {...(timed && {
              timeZone: {
                value: snap.timeZone,
                options: timeZones(snap.timeZone),
                onChange: (zone: string) => void controller.setTimeZone(zone),
              },
            })}
            footer={
              <div className="flex flex-col gap-2">
                <Button
                  variant="primary"
                  disabled={sel.selected === 0}
                  onClick={() => void controller.start(backup)}
                >
                  {t('start', { n: sel.selected })}
                </Button>
                {sel.selected === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('review.noneSelected')}</p>
                ) : null}
                <Button variant="outline" onClick={() => controller.reset()}>
                  {t('change')}
                </Button>
                {plan.pairing.manifest ? null : <ManifestButton controller={controller} />}
              </div>
            }
          />
        }
      >
        {snap.error ? <ErrorState scope="inline" title={t(snap.error)} /> : null}
        <Suspense fallback={<PlanningState />}>
          <ReviewTable
            controller={controller}
            pairing={plan.pairing}
            meta={plan.meta}
            edits={plan.edits}
            excluded={excluded}
            region={settings.phoneRegion}
            contacts={contacts}
          />
        </Suspense>
      </Layout>
    );
  }
  return (
    <QueuePanel
      controller={controller}
      queue={snap.queue}
      flow={flow}
      me={me}
      region={settings.phoneRegion}
      folderPicker={folderPicker}
    />
  );
}

function PlanningState() {
  const t = useTranslations('upload.bulk');
  return (
    <Card className="flex items-center gap-3 p-5" aria-busy="true">
      <Spinner />
      <span>{t('planning')}</span>
    </Card>
  );
}

function Layout({ side, children }: { side: ReactNode; children: ReactNode }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6 max-lg:order-last">{children}</div>
      <div className="flex flex-col gap-4">{side}</div>
    </div>
  );
}

function ManifestButton({ controller }: { controller: BulkController }) {
  const t = useTranslations('upload.bulk');
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="ghost" onClick={() => input.current?.click()}>
        <FileSpreadsheet className="size-4" aria-hidden />
        {t('manifest')}
      </Button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".csv,text/csv"
        aria-label={t('manifest')}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void controller.addManifest(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

type Counts = { audioOnly: number; paired: number; transcriptOnly: number; duplicates: number };

function queueCounts(items: readonly BulkItemState[]): Counts {
  const c: Counts = { audioOnly: 0, paired: 0, transcriptOnly: 0, duplicates: 0 };
  for (const i of items) {
    if (i.audio && i.transcript) c.paired++;
    else if (i.audio) c.audioOnly++;
    else c.transcriptOnly++;
    if (i.status === 'duplicate') c.duplicates++;
  }
  return c;
}

function Summary({
  me,
  flow,
  translation,
  counts,
  minutes,
  manifestCovered,
  unreadable = 0,
  backup,
  timeZone,
  footer,
  collapsible = false,
}: {
  me: Me;
  flow: TranscriptionFlow;
  /** Shown before the import starts: every file is translated without a prompt. */
  translation?: TranslationFlow;
  counts: Counts;
  minutes: number;
  manifestCovered: number;
  unreadable?: number;
  backup?: { checked: boolean; onChange: (v: boolean) => void };
  /** Shown when some call takes its time from a file name or the manifest. */
  timeZone?: { value: string; options: readonly string[]; onChange: (v: string) => void };
  footer?: ReactNode;
  collapsible?: boolean;
}) {
  const t = useTranslations('upload.bulk');
  const tu = useTranslations('upload');
  const locale = intlLocale(useLocale());
  const [open, setOpen] = useState(false);
  const left = minutesLeft(me, flow);
  const warnings = quotaWarnings(me, flow, {
    calls: counts.audioOnly + counts.paired + counts.transcriptOnly - counts.duplicates,
    minutes,
    backup: backup?.checked ?? false,
  });
  const limit = me.limits.transcriptionMinutesPerMonth;
  const usedNow = Math.ceil(me.usage.transcriptionSecondsThisMonth / 60);
  const card = (
    <PreflightSummary
      title={t('summary')}
      locale={locale}
      counts={[
        { n: counts.audioOnly, label: t('sum.audio') },
        { n: counts.paired, label: t('sum.paired') },
        { n: counts.transcriptOnly, label: t('sum.tx') },
        { n: counts.duplicates, label: t('sum.dup') },
      ]}
      usage={
        left !== null && counts.audioOnly > 0 && minutes > 0 ? (
          <UsageMeter
            label={t('usage')}
            used={usedNow + minutes}
            limit={limit}
            unit={t('min')}
            locale={locale}
          />
        ) : undefined
      }
      note={
        [
          minutes > 0 && flow.route !== 'off' ? t('minutes', { n: minutes }) : null,
          manifestCovered > 0 ? t('manifestApplied', { n: manifestCovered }) : null,
          unreadable > 0 ? t('unreadable', { n: unreadable }) : null,
        ]
          .filter(Boolean)
          .join(' ') || undefined
      }
      dataFlow={
        counts.audioOnly > 0 || translation ? (
          <div className="flex flex-col gap-3">
            {counts.audioOnly > 0 ? (
              flow.route === 'off' ? (
                <ErrorState scope="inline" title={tu('txOff')} />
              ) : (
                <TranscriptionNote flow={flow} />
              )
            ) : null}
            {translation ? <TranslationNote flow={translation} /> : null}
          </div>
        ) : null
      }
      {...(timeZone && { timeZone: { ...timeZone, label: t('timeZone') } })}
      {...(backup && { backup: { ...backup, label: t('backup') } })}
    />
  );
  return (
    <>
      {warnings.map((w) => (
        <StatusBanner key={w.kind} condition="limit">
          {w.kind === 'minutes'
            ? t('overQuota', { n: w.needed, m: w.left })
            : w.kind === 'calls'
              ? t('overCalls', { n: w.incoming, m: w.left })
              : t('storage', { n: w.percent })}
        </StatusBanner>
      ))}
      {collapsible ? (
        <>
          <Button
            variant="outline"
            className="justify-between lg:hidden"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span>
              {t('summary')}{' '}
              <bdi className="tabular">
                {[counts.audioOnly, counts.paired, counts.transcriptOnly, counts.duplicates].join(
                  ' · ',
                )}
              </bdi>
            </span>
            <ChevronDown className="size-4" aria-hidden />
          </Button>
          <div className={open ? undefined : 'max-lg:hidden'}>{card}</div>
        </>
      ) : (
        card
      )}
      {footer}
    </>
  );
}

type Filter = 'all' | 'active' | 'failed' | 'dup';

const inFilter = (f: Filter, i: BulkItemState) =>
  f === 'all' ||
  (f === 'failed' && i.status === 'failed') ||
  (f === 'dup' && i.status === 'duplicate') ||
  (f === 'active' && !['queued', 'done', 'duplicate', 'failed'].includes(i.status));

function QueuePanel({
  controller,
  queue,
  flow,
  me,
  region,
  folderPicker,
}: {
  controller: BulkController;
  queue: QueueView;
  flow: TranscriptionFlow;
  me: Me;
  region: string;
  folderPicker: boolean;
}) {
  const t = useTranslations('upload.bulk');
  const tu = useTranslations('upload');
  const locale = intlLocale(useLocale());
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);
  const [listening, setListening] = useState<{
    id: string;
    fileName: string;
    audio: FileRef;
  } | null>(null);
  const { counts, items } = queue;
  const remaining = counts.queued + counts.active;
  const finished = remaining === 0 && !queue.restored;
  const pausing = queue.paused && counts.active > 0;
  useWakeLock(remaining > 0 && !queue.paused && !queue.restored);
  const tabCounts: Record<Filter, number> = {
    all: counts.total,
    active: counts.active,
    failed: counts.failed,
    dup: counts.duplicate,
  };
  const visible = items.filter((i) => inFilter(filter, i));
  const emptyCount = items.filter(isEmptyRecording).length;
  const done = counts.done + counts.duplicate + counts.failed;

  const progressLabel = (
    <span>
      <b>{t('progressDone', { done, total: counts.total })}</b>{' '}
      {t('progressDetail', { active: counts.active, failed: counts.failed, dup: counts.duplicate })}
      {queue.etaSec ? ` ${t('eta', { t: formatDuration(queue.etaSec, locale) })}` : ''}
      {pausing ? ` ${t('pausing')}` : ''}
    </span>
  );

  return (
    <Layout
      side={
        <Summary
          me={me}
          flow={flow}
          counts={queueCounts(items)}
          minutes={0}
          manifestCovered={0}
          collapsible
        />
      }
    >
      {queue.restored ? (
        <StatusBanner
          condition="import"
          action={
            queue.missing === 'files' ? (
              <Reattach controller={controller} folderPicker={folderPicker} />
            ) : (
              <Button variant="outline" size="sm" onClick={() => void controller.resume()}>
                {t('resume')}
              </Button>
            )
          }
        >
          {t('resumeBanner', { done, total: counts.total })}{' '}
          {queue.missing === 'files'
            ? t('repick')
            : queue.missing === 'access'
              ? t('access')
              : null}
        </StatusBanner>
      ) : null}
      <Card className="flex flex-col gap-3 p-5">
        {finished ? (
          <div className="flex flex-col gap-3" aria-live="polite">
            <p>
              <b>{t('done', { n: counts.done, f: counts.failed, d: counts.duplicate })}</b>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" asChild>
                <Link href="/app">{t('viewCalls')}</Link>
              </Button>
              {counts.failed > 0 ? (
                <Button variant="outline" onClick={() => controller.retry()}>
                  <RotateCcw className="size-4" aria-hidden />
                  {t('retryAll')}
                </Button>
              ) : null}
              {emptyCount > 0 ? (
                <Button variant="outline" onClick={() => controller.saveEmpty()}>
                  {t('saveAllEmpty', { n: emptyCount })}
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => void controller.clear()}>
                {t('newImport')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <JobProgress
              done={done}
              total={counts.total}
              label={progressLabel}
              paused={queue.paused}
              {...(!queue.restored && {
                onPause: () => controller.pause(),
                onResume: () => (pausing ? controller.cancelPause() : void controller.resume()),
              })}
              labels={{
                pause: t('pause'),
                resume: pausing ? t('cancelPause') : t('resume'),
                stop: t('stop'),
                progress: t('progressLabel'),
              }}
            />
            <p className="flex items-center gap-2 text-muted-foreground text-sm">
              <Info className="size-4" aria-hidden />
              {t('closeHint')}
            </p>
          </>
        )}
      </Card>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b ps-3 pe-3 pt-2">
          <Tabs
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            className="min-w-0 max-w-full"
          >
            <TabsList aria-label={t('filter')} className="overflow-x-auto border-0">
              {(['all', 'active', 'failed', 'dup'] as const).map((f) => (
                <TabsTrigger key={f} value={f}>
                  {t(`tab.${f}`)}
                  <Badge
                    variant={f === 'failed' && tabCounts.failed > 0 ? 'destructive' : 'neutral'}
                  >
                    {new Intl.NumberFormat(locale).format(tabCounts[f])}
                  </Badge>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <span className="ms-auto flex flex-wrap gap-1">
            {emptyCount > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => controller.saveEmpty()}>
                {t('saveAllEmpty', { n: emptyCount })}
              </Button>
            ) : null}
            {counts.failed > emptyCount ? (
              <Button variant="ghost" size="sm" onClick={() => controller.retry()}>
                <RotateCcw className="size-4" aria-hidden />
                {t('retryAll')}
              </Button>
            ) : null}
          </span>
        </div>
        {visible.length === 0 ? (
          <p className="p-5 text-muted-foreground">{t('noneInTab')}</p>
        ) : (
          <QueueTable>
            {visible.slice(0, shown).map((item) => {
              const fileName = (item.audio ?? item.transcript)!.name;
              const empty = isEmptyRecording(item);
              const reason =
                item.status === 'failed' && item.reason
                  ? tu(
                      failureKey(
                        item.reason,
                        queue.lastStep.get(item.id) ?? null,
                      ) as 'reason.unknown',
                    )
                  : undefined;
              return (
                <QueueRow
                  key={item.id}
                  fileName={fileName}
                  parts={parts(item, tu)}
                  contact={contactOf(queue.meta.get(item.id), region)}
                  status={{ state: item.status, label: tu(`queue.${item.status}`), reason }}
                  duplicateOf={
                    item.status === 'duplicate' && item.existingId ? (
                      <DuplicateLink id={item.existingId} />
                    ) : undefined
                  }
                  retry={
                    item.status === 'failed' && !empty
                      ? { label: t('retry'), onRetry: () => controller.retry(item.id) }
                      : undefined
                  }
                  actions={
                    empty ? (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setListening({ id: item.id, fileName, audio: item.audio! })
                          }
                        >
                          {t('listen')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => controller.saveEmpty(item.id)}
                        >
                          {t('saveEmpty')}
                        </Button>
                      </>
                    ) : undefined
                  }
                />
              );
            })}
          </QueueTable>
        )}
        <ShowMore total={visible.length} shown={shown} onMore={() => setShown(shown + PAGE)} />
      </Card>
      {listening ? (
        <Suspense fallback={null}>
          <EmptyCallDialog
            controller={controller}
            item={listening}
            onClose={() => setListening(null)}
          />
        </Suspense>
      ) : null}
    </Layout>
  );
}

function Reattach({
  controller,
  folderPicker,
}: {
  controller: BulkController;
  folderPicker: boolean;
}) {
  const t = useTranslations('upload.bulk');
  const input = useRef<HTMLInputElement>(null);
  return (
    <span className="flex flex-wrap gap-2">
      {folderPicker ? (
        <Button
          variant="outline"
          size="sm"
          className="max-md:hidden"
          onClick={() => void controller.reattach('folder')}
        >
          {t('chooseFolder')}
        </Button>
      ) : null}
      <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
        {t('repickFiles')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label={t('repickFiles')}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) void controller.reattach({ files });
          e.target.value = '';
        }}
      />
    </span>
  );
}

/** "Matches the call on 2 Nov, 16:20", decrypted on demand; plain words until then. */
function DuplicateLink({ id }: { id: string }) {
  const t = useTranslations('upload');
  const { client } = useAppSession();
  const locale = intlLocale(useLocale());
  const [when, setWhen] = useState<string | null>(null);
  useEffect(() => {
    let stale = false;
    getCall(client!.ctx, id).then(
      (call) => {
        if (stale) return;
        setWhen(formatDateTime(callStartedAt(call, call.meta.startedAt), locale));
      },
      () => {},
    );
    return () => {
      stale = true;
    };
  }, [client, id, locale]);
  return <Link href={`/app/calls/${id}`}>{when ? t('bulk.dupOf', { when }) : t('dup.open')}</Link>;
}
