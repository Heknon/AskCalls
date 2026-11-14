import {
  type BulkCounts,
  type BulkItemState,
  BulkQueue,
  type BulkState,
  type BulkStateStore,
  type ClientContext,
  createBulkRunner,
  deviceTimeZone,
  type FailureReason,
  type ImportPlan,
  isTimeZone,
  loadManifest,
  type PreflightSummary,
  pairFiles,
  planBatch,
  planImport,
  preflight,
} from '@askcalls/client-core';
import { openIngestSource } from '../adapters/files';

export interface BatchOptions {
  path: string;
  manifestPath?: string;
  backupRecordings: boolean;
  transcribe: 'auto' | 'never';
  store: BulkStateStore;
  /** IANA zone of the times in file names and the manifest; this computer's by default. */
  timeZone?: string;
}

function zoneOf(timeZone: string | undefined): string {
  if (timeZone === undefined) return deviceTimeZone();
  if (!isTimeZone(timeZone)) {
    throw new Error(`${timeZone} is not a time zone: use an IANA name such as Asia/Jerusalem`);
  }
  return timeZone;
}

export interface PreparedBatch {
  queue: BulkQueue;
  /** Null when resuming: the counts were shown when the run started. */
  preflight: PreflightSummary | null;
  /** True when an interrupted run of the same files was picked up again. */
  resumed: boolean;
  /** Files skipped: neither audio nor transcript, or a second file for the same call. */
  ignored: number;
  /** Manifest rows with a problem (unknown file, bad date or direction). */
  manifestIssues: number;
}

const sameItems = (a: BulkState, b: BulkState) =>
  a.items.length === b.items.length &&
  a.items.every((x, i) => {
    const y = b.items[i]!;
    return (
      x.id === y.id && x.audio?.ref === y.audio?.ref && x.transcript?.ref === y.transcript?.ref
    );
  });

/**
 * Plans a bulk ingest (spec 8): pairs files, reads the manifest, computes the preflight summary
 * and builds the queue. When the store holds an unfinished run over the same files, that run is
 * resumed instead and its failed items are queued again.
 */
export async function prepareBatch(ctx: ClientContext, opts: BatchOptions): Promise<PreparedBatch> {
  const timeZone = zoneOf(opts.timeZone);
  const source = await openIngestSource(opts.path, opts.manifestPath);
  const pairing = pairFiles(source.files);
  const manifestRef = source.manifest ?? pairing.manifest;
  const manifest = await loadManifest(source.reader, manifestRef, timeZone);
  const settings = await ctx.userData.get('settings');
  const run = createBulkRunner(ctx, {
    reader: source.reader,
    manifest,
    backupRecordings: opts.backupRecordings,
    source: 'agent',
    transcribe: opts.transcribe,
    region: settings.phoneRegion,
    timeZone,
  });
  const plan = planBatch(
    { ...pairing, manifest: manifestRef },
    { backupRecordings: opts.backupRecordings, timeZone },
  );

  const previous = await opts.store.load();
  const resumable =
    previous !== null &&
    previous.backupRecordings === opts.backupRecordings &&
    previous.timeZone === timeZone &&
    sameItems(previous, plan) &&
    previous.items.some((i) => i.status !== 'done' && i.status !== 'duplicate');
  const queue = resumable
    ? await BulkQueue.restore({ store: opts.store, run })
    : await BulkQueue.create(plan, { store: opts.store, run });
  if (!queue) throw new Error('the saved ingest queue could not be read');
  if (resumable) queue.retry();

  return {
    queue,
    preflight: resumable ? null : await preflight(ctx, pairing, { reader: source.reader }),
    resumed: resumable,
    ignored: pairing.ignored.length,
    manifestIssues: manifest?.issues.length ?? 0,
  };
}

/**
 * The dry run: how the folder's files pair into calls, what is skipped and what the manifest
 * says, without keys, a login or a request. File names are read as `prepareBatch` reads them.
 */
export async function planFolder(opts: {
  path: string;
  manifestPath?: string;
  region?: string;
  timeZone?: string;
}): Promise<ImportPlan> {
  const timeZone = zoneOf(opts.timeZone);
  const source = await openIngestSource(opts.path, opts.manifestPath);
  const pairing = pairFiles(source.files);
  const manifestRef = source.manifest ?? pairing.manifest;
  const manifest = await loadManifest(source.reader, manifestRef, timeZone);
  return planImport({ ...pairing, manifest: manifestRef }, manifest, {
    timeZone,
    ...(opts.region && { region: opts.region }),
  });
}

export interface BatchReport {
  counts: BulkCounts;
  /** Content-free reasons with how many files failed for each. */
  failures: Partial<Record<FailureReason, number>>;
  items: readonly Readonly<BulkItemState>[];
}

export function batchReport(queue: BulkQueue): BatchReport {
  const failures: Partial<Record<FailureReason, number>> = {};
  for (const i of queue.items) {
    if (i.status === 'failed' && i.reason) failures[i.reason] = (failures[i.reason] ?? 0) + 1;
  }
  return { counts: queue.counts(), failures, items: queue.items };
}
