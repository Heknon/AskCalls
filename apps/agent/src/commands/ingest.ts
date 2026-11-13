import type { BulkCounts, BulkQueue, PreflightSummary } from '@askcalls/client-core';
import type { Command } from 'commander';
import { JsonFileBulkStateStore } from '../adapters/bulk-state';
import { type AgentDeps, openAccount, unlockAgent } from '../agent';
import { paths } from '../config';
import { batchReport, prepareBatch } from '../ingest/batch';
import { type Io, terminalIo } from '../io';
import { fail } from './run';

export interface IngestCommandOptions {
  manifest?: string;
  backupRecordings?: boolean;
  transcribe: string;
}

function preflightLines(p: PreflightSummary): string[] {
  return [
    `  ${p.paired} with audio and transcript`,
    `  ${p.transcriptOnly} transcript only`,
    `  ${p.audioOnly} audio only, to transcribe (about ${p.estimatedMinutes} min)`,
    ...(p.likelyDuplicates ? [`  ${p.likelyDuplicates} likely already imported`] : []),
    ...(p.unreadable.length ? [`  ${p.unreadable.length} transcripts that cannot be read`] : []),
  ];
}

const bar = (c: BulkCounts, width = 24) => {
  const finished = c.done + c.duplicate + c.failed;
  const filled = c.total ? Math.round((finished / c.total) * width) : width;
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${finished}/${c.total}`;
};

const countsLine = (c: BulkCounts) =>
  `done ${c.done} · duplicate ${c.duplicate} · failed ${c.failed} · in progress ${c.active}`;

/**
 * Terminal progress: one redrawn status line on a TTY, otherwise one line per finished file.
 * File names are shown locally only; nothing here leaves the computer.
 */
function showProgress(queue: BulkQueue, io: Io, tty: boolean): () => void {
  if (tty) {
    const draw = () =>
      process.stderr.write(`\r\x1b[2K${bar(queue.counts())}  ${countsLine(queue.counts())}`);
    draw();
    const unsubscribe = queue.subscribe(draw);
    return () => {
      unsubscribe();
      process.stderr.write('\n');
    };
  }
  return queue.subscribe((item) => {
    if (item.status === 'done' || item.status === 'duplicate')
      io.out(`${item.status.padEnd(9)} ${item.name}`);
    else if (item.status === 'failed')
      io.out(`failed    ${item.name} (${item.reason ?? 'unknown'})`);
  });
}

/** `askcalls ingest <path>`: the client-core bulk pipeline from the command line. */
export async function runIngest(
  path: string,
  opts: IngestCommandOptions,
  deps: AgentDeps & { io: Io; tty?: boolean },
): Promise<{ counts: BulkCounts }> {
  const { io } = deps;
  if (opts.transcribe !== 'auto' && opts.transcribe !== 'never') {
    throw new Error('--transcribe must be auto or never');
  }
  const agent = await unlockAgent(await openAccount(deps), deps);
  const store = new JsonFileBulkStateStore(paths(agent.dir).bulkState);
  const batch = await prepareBatch(agent.ctx, {
    path,
    ...(opts.manifest && { manifestPath: opts.manifest }),
    backupRecordings: opts.backupRecordings ?? false,
    transcribe: opts.transcribe,
    store,
  });
  const { queue } = batch;
  if (batch.resumed) {
    io.out(`Resuming the earlier import: ${queue.counts().done} already done.`);
  } else if (batch.preflight) {
    io.out(`Found ${queue.counts().total} calls:`);
    for (const line of preflightLines(batch.preflight)) io.out(line);
  }
  if (batch.ignored) io.out(`Skipping ${batch.ignored} other files.`);
  if (batch.manifestIssues) io.out(`The manifest has ${batch.manifestIssues} rows with problems.`);
  if (agent.ctx.transcriber === null && batch.preflight?.audioOnly) {
    io.out('Transcription is off in Settings → Providers: audio-only files will fail.');
  }

  let interrupted = false;
  const onSigint = () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    queue.pause();
    io.err('\nPausing after the files in progress. Run the same command again to resume.');
  };
  process.on('SIGINT', onSigint);
  const stop = showProgress(queue, io, deps.tty ?? Boolean(process.stderr.isTTY));
  try {
    queue.start();
    await queue.whenIdle();
  } finally {
    stop();
    process.off('SIGINT', onSigint);
  }

  const report = batchReport(queue);
  const c = report.counts;
  io.out('');
  io.out(`Imported ${c.done}, duplicates ${c.duplicate}, failed ${c.failed} (of ${c.total}).`);
  for (const [reason, n] of Object.entries(report.failures)) io.out(`  ${n} failed: ${reason}`);
  if (c.failed) io.out('Run the same command again to retry the failed files.');
  if (!interrupted && c.failed === 0) await queue.clear();
  agent.session.lock();
  return { counts: c };
}

export function registerIngest(program: Command) {
  program
    .command('ingest')
    .description('Import calls from a file or folder')
    .argument('<path>', 'audio or transcript file, folder, or ZIP')
    .option(
      '--manifest <file>',
      'manifest.csv with file, phone, started_at, direction, contact_name, tags',
    )
    .option('--backup-recordings', 'store encrypted recording backups')
    .option('--transcribe <mode>', 'auto | never', 'auto')
    .action((path: string, opts: IngestCommandOptions) =>
      runIngest(path, opts, { io: terminalIo() }).then(({ counts }) => {
        if (counts.failed) process.exitCode = 1;
      }, fail),
    );
}
