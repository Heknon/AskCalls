'use client';

import type { Pairing } from '@askcalls/client-core/bulk/pairing';
import type { BulkItemState } from '@askcalls/client-core/bulk/queue';
import { getCall } from '@askcalls/client-core/calls';
import type { IngestMeta } from '@askcalls/client-core/ingest';
import type { Settings } from '@askcalls/client-core/userdata';
import { dateFromDay } from '@askcalls/domain';
import { DEFAULT_PHONE_REGION, isPhoneRegion, parsePhone } from '@askcalls/indexing';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { FileDropZone } from '@askcalls/ui/components/FileDropZone';
import { JobProgress } from '@askcalls/ui/components/JobProgress';
import { PreflightSummary } from '@askcalls/ui/components/PreflightSummary';
import { QueueRow } from '@askcalls/ui/components/QueueRow';
import { StatusBanner } from '@askcalls/ui/components/StatusBanner';
import { UsageMeter } from '@askcalls/ui/components/UsageMeter';
import { formatDateTime, formatDuration } from '@askcalls/ui/lib/format';
import { Badge } from '@askcalls/ui/primitives/badge';
import { Button } from '@askcalls/ui/primitives/button';
import { Card } from '@askcalls/ui/primitives/card';
import { Spinner } from '@askcalls/ui/primitives/spinner';
import { TableHead } from '@askcalls/ui/primitives/table';
import { Tabs, TabsList, TabsTrigger } from '@askcalls/ui/primitives/tabs';
import { ChevronDown, FileSpreadsheet, Info, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { supportsDirectoryPicker } from '../../../../../../client/adapters/bulk-files';
import { type Me, useAppSession } from '../../../../../../client/session/session';
import { intlLocale } from '../../../../../../i18n/locales';
import { type BulkController, bulkController, type Plan, type QueueView } from './bulk-controller';
import {
  failureKey,
  minutesLeft,
  quotaWarnings,
  type TranscriptionFlow,
  type TranslationFlow,
} from './plan';
import { TranscriptionNote, TranslationNote } from './transcription-note';

const PAGE = 100;

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
  recordingsOff: boolean;
}

/** U2: a folder, files or a ZIP, then the pre-flight summary, then the queue. */
export function BulkUpload({ flow, translation, settings, recordingsOff }: BulkUploadProps) {
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
      </div>
    );
  }
  if (snap.phase === 'planning') return <PlanningState />;
  if (snap.phase === 'preflight') {
    const { plan } = snap;
    return (
      <Layout
        side={
          <Summary
            me={me}
            flow={flow}
            translation={translation}
            counts={summaryCounts(plan)}
            minutes={plan.summary.estimatedMinutes}
            manifestCovered={plan.manifestCovered}
            unreadable={plan.summary.unreadable.length}
            backup={recordingsOff ? undefined : { checked: backup, onChange: setBackup }}
            footer={
              <div className="flex flex-col gap-2">
                <Button variant="primary" onClick={() => void controller.start(backup)}>
                  {t('start')}
                </Button>
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
        <PlannedTable pairing={plan.pairing} meta={plan.meta} region={settings.phoneRegion} />
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

function summaryCounts(plan: Plan): Counts {
  return {
    audioOnly: plan.summary.audioOnly,
    paired: plan.summary.paired,
    transcriptOnly: plan.summary.transcriptOnly,
    duplicates: plan.summary.likelyDuplicates,
  };
}

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

function contactOf(meta: IngestMeta | undefined, region: string) {
  const phone = meta?.phone
    ? parsePhone(meta.phone, isPhoneRegion(region) ? region : DEFAULT_PHONE_REGION)
    : null;
  if (!meta?.contactName && !phone) return undefined;
  return { ...(meta?.contactName && { name: meta.contactName }), ...(phone && { phone }) };
}

function PlannedTable({
  pairing,
  meta,
  region,
}: {
  pairing: Pairing;
  meta: ReadonlyMap<string, IngestMeta>;
  region: string;
}) {
  const t = useTranslations('upload');
  const [shown, setShown] = useState(PAGE);
  const items = pairing.items.slice(0, shown);
  return (
    <Card className="overflow-hidden">
      <QueueTable>
        {items.map((p) => (
          <QueueRow
            key={p.key}
            fileName={(p.audio ?? p.transcript)!.name}
            parts={parts(p, t)}
            contact={contactOf(meta.get(p.key), region)}
            status={{ state: 'queued', label: t('queue.queued') }}
          />
        ))}
      </QueueTable>
      <ShowMore total={pairing.items.length} shown={shown} onMore={() => setShown(shown + PAGE)} />
    </Card>
  );
}

function parts(
  i: { audio: unknown; transcript: unknown },
  t: ReturnType<typeof useTranslations<'upload'>>,
) {
  return [i.audio ? t('parts.audio') : null, i.transcript ? t('parts.transcript') : null].filter(
    (p): p is string => p !== null,
  );
}

function QueueTable({ children }: { children: ReactNode }) {
  const t = useTranslations('upload.bulk.col');
  const tb = useTranslations('upload.bulk');
  return (
    <table className="w-full border-collapse">
      <thead className="max-md:hidden">
        <tr>
          <TableHead>{t('file')}</TableHead>
          <TableHead>{t('contact')}</TableHead>
          <TableHead>{t('status')}</TableHead>
          <TableHead>
            <span className="sr-only">{tb('retry')}</span>
          </TableHead>
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function ShowMore({ total, shown, onMore }: { total: number; shown: number; onMore: () => void }) {
  const t = useTranslations('upload.bulk');
  if (total <= shown) return null;
  return (
    <div className="flex justify-center p-3">
      <Button variant="ghost" onClick={onMore}>
        {t('showMore', { n: Math.min(PAGE, total - shown) })}
      </Button>
    </div>
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
  const { counts, items } = queue;
  const remaining = counts.queued + counts.active;
  const finished = remaining === 0 && !queue.restored;
  const pausing = queue.paused && counts.active > 0;
  const tabCounts: Record<Filter, number> = {
    all: counts.total,
    active: counts.active,
    failed: counts.failed,
    dup: counts.duplicate,
  };
  const visible = items.filter((i) => inFilter(filter, i));
  const done = counts.done + counts.duplicate + counts.failed;

  const progressLabel = (
    <span>
      <b>{t('progressDone', { done, total: counts.total })}</b>{' '}
      {t('progressDetail', { active: counts.active, failed: counts.failed, dup: counts.duplicate })}
      {queue.etaSec ? ` ${t('eta', { t: formatDuration(queue.etaSec, locale) })}` : ''}
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
              paused={queue.paused && !pausing}
              {...(!queue.restored && {
                onPause: () => !pausing && controller.pause(),
                onResume: () => void controller.resume(),
              })}
              labels={{
                pause: pausing ? t('pausing') : t('pause'),
                resume: t('resume'),
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
          {counts.failed > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="ms-auto"
              onClick={() => controller.retry()}
            >
              <RotateCcw className="size-4" aria-hidden />
              {t('retryAll')}
            </Button>
          ) : null}
        </div>
        {visible.length === 0 ? (
          <p className="p-5 text-muted-foreground">{t('noneInTab')}</p>
        ) : (
          <QueueTable>
            {visible.slice(0, shown).map((item) => {
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
                  fileName={(item.audio ?? item.transcript)!.name}
                  parts={parts(item, tu)}
                  contact={contactOf(queue.meta.get(item.id), region)}
                  status={{ state: item.status, label: tu(`queue.${item.status}`), reason }}
                  duplicateOf={
                    item.status === 'duplicate' && item.existingId ? (
                      <DuplicateLink id={item.existingId} />
                    ) : undefined
                  }
                  retry={
                    item.status === 'failed'
                      ? { label: t('retry'), onRetry: () => controller.retry(item.id) }
                      : undefined
                  }
                />
              );
            })}
          </QueueTable>
        )}
        <ShowMore total={visible.length} shown={shown} onMore={() => setShown(shown + PAGE)} />
      </Card>
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
        const at = call.meta.startedAt ? new Date(call.meta.startedAt) : dateFromDay(call.day);
        setWhen(formatDateTime(at, locale));
      },
      () => {},
    );
    return () => {
      stale = true;
    };
  }, [client, id, locale]);
  return <Link href={`/app/calls/${id}`}>{when ? t('bulk.dupOf', { when }) : t('dup.open')}</Link>;
}
