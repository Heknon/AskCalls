import { listCalls } from '@askcalls/api-contract/routes/calls';
import { contentToken } from '@askcalls/crypto';
import { contentText, DEFAULT_PHONE_REGION, isPhoneRegion } from '@askcalls/indexing';
import { parseTranscript } from '@askcalls/transcript-formats';
import type { ClientContext } from '../context';
import { type IngestMeta, ingestCall, type MetaEdits } from '../ingest';
import type { AudioSource } from '../ports/index';
import { parseRecordingFileName } from './filenames';
import { type Manifest, parseManifest } from './manifest';
import type { FileRef, Pairing, PlannedItem } from './pairing';
import type { BulkItemState, BulkRunner } from './queue';

/** Resolves the queue's file references to content, in memory, when an item runs. */
export interface BulkFileReader {
  audio(file: FileRef): Promise<AudioSource>;
  bytes(file: FileRef): Promise<Uint8Array>;
}

/** `timeZone`: the zone of `started_at` values without an offset (IANA, default UTC). */
export async function loadManifest(
  reader: BulkFileReader,
  file: FileRef | null,
  timeZone?: string,
): Promise<Manifest | null> {
  return file ? parseManifest(await reader.bytes(file), timeZone ? { timeZone } : {}) : null;
}

export interface MetaOptions {
  manifest: Manifest | null;
  region?: string;
  /** IANA zone of the phone's clock, for times in file names (default UTC). */
  timeZone?: string;
}

/**
 * File-name metadata (Samsung, iPhone), overridden field by field by the manifest row, then by
 * the user's edits.
 */
export function itemMeta(
  item: Pick<PlannedItem, 'audio' | 'transcript'> & { edits?: MetaEdits },
  opts: MetaOptions,
): IngestMeta {
  const region = opts.region && isPhoneRegion(opts.region) ? opts.region : DEFAULT_PHONE_REGION;
  const names = [item.audio?.name, item.transcript?.name].filter((n): n is string => !!n);
  const fromName = names
    .map((n) =>
      parseRecordingFileName(n, { region, ...(opts.timeZone && { timeZone: opts.timeZone }) }),
    )
    .find((m) => m !== null);
  const row = names.map((n) => opts.manifest?.lookup(n)).find((r) => r !== undefined);
  return {
    phone: row?.phone ?? fromName?.phone ?? null,
    startedAt: row?.startedAt ?? fromName?.startedAt ?? null,
    direction: row?.direction ?? null,
    contactName: row?.contactName ?? fromName?.contactName ?? null,
    tags: row?.tags ?? [],
    ...item.edits,
  };
}

export interface BulkRunnerOptions extends Omit<MetaOptions, 'manifest'> {
  reader: BulkFileReader;
  manifest: Manifest | null;
  backupRecordings: boolean;
  source?: 'app' | 'agent';
  /** `never`: audio without a transcript fails instead of being transcribed. */
  transcribe?: 'auto' | 'never';
}

/** Runs one queue item through the ingest pipeline. */
export function createBulkRunner(ctx: ClientContext, opts: BulkRunnerOptions): BulkRunner {
  const runCtx = opts.transcribe === 'never' ? { ...ctx, transcriber: null } : ctx;
  return async (item: Readonly<BulkItemState>, ingestOpts) => {
    const [audio, transcript] = await Promise.all([
      item.audio ? opts.reader.audio(item.audio) : Promise.resolve(undefined),
      item.transcript && !item.empty
        ? opts.reader.bytes(item.transcript)
        : Promise.resolve(undefined),
    ]);
    return ingestCall(
      runCtx,
      {
        source: opts.source ?? 'app',
        ...(audio && { audio }),
        ...(transcript && { transcript }),
        ...(item.transcript && { transcriptFileName: item.transcript.name }),
        sourceFileName: (item.audio ?? item.transcript)!.name,
        meta: itemMeta(item, opts),
        backupRecording: opts.backupRecordings && !!item.audio,
        ...(item.empty && { empty: true }),
      },
      ingestOpts,
    );
  };
}

export interface PreflightSummary {
  audioOnly: number;
  /** Transcription minutes the audio-only files will use (estimated). */
  estimatedMinutes: number;
  /** Estimated audio seconds of each audio-only item, by item key. */
  secondsByKey: Record<string, number>;
  paired: number;
  transcriptOnly: number;
  likelyDuplicates: number;
  /** Item keys counted as likely duplicates. */
  duplicateKeys: string[];
  /** Transcripts that will fail to parse. */
  unreadable: string[];
}

/** Bytes per second of a typical phone recording (~64 kbps) when no duration is known. */
const FALLBACK_BYTES_PER_SEC = 8_000;

/**
 * The summary shown before a batch starts (spec 8): counts per kind, estimated minutes for
 * audio-only files, and likely duplicates (transcripts already uploaded, or audio files repeated
 * in the batch).
 */
export async function preflight(
  ctx: ClientContext,
  pairing: Pairing,
  opts: {
    reader: BulkFileReader;
    estimateDurationSec?: (file: FileRef) => Promise<number | null>;
    checkServer?: boolean;
  },
): Promise<PreflightSummary> {
  const s: PreflightSummary = {
    audioOnly: 0,
    estimatedMinutes: 0,
    secondsByKey: {},
    paired: 0,
    transcriptOnly: 0,
    likelyDuplicates: 0,
    duplicateKeys: [],
    unreadable: [],
  };
  let seconds = 0;
  const audioSeen = new Map<string, string>();
  const dup = new Set<string>();
  for (const item of pairing.items) {
    if (item.audio && item.transcript) s.paired++;
    else if (item.audio) {
      s.audioOnly++;
      const est = (await opts.estimateDurationSec?.(item.audio)) ?? null;
      const sec = est ?? item.audio.size / FALLBACK_BYTES_PER_SEC;
      s.secondsByKey[item.key] = sec;
      seconds += sec;
    } else s.transcriptOnly++;

    if (item.audio) {
      const sig = `${item.audio.size}:${item.audio.name.split('/').pop()!.toLowerCase()}`;
      if (audioSeen.has(sig)) dup.add(item.key);
      else audioSeen.set(sig, item.key);
    }
    if (item.transcript && opts.checkServer !== false) {
      let text: string;
      try {
        text = parseTranscript(await opts.reader.bytes(item.transcript), {
          filename: item.transcript.name,
        }).transcript.text;
      } catch {
        s.unreadable.push(item.key);
        continue;
      }
      const tok = await contentToken(ctx.session.keys.indexKey, contentText(text));
      // The count is a hint: the import checks again before each upload.
      const res = await ctx.api
        .request(listCalls, { query: { content_tok: tok, limit: 1 } })
        .catch(() => null);
      if (res?.items.length) dup.add(item.key);
    }
  }
  s.estimatedMinutes = Math.ceil(seconds / 60);
  s.duplicateKeys = [...dup];
  s.likelyDuplicates = dup.size;
  return s;
}
