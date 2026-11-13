import type { CallDirection } from '@askcalls/domain';
import type { Manifest, ManifestIssue } from './manifest';
import { classifyFile, type Pairing } from './pairing';
import { itemMeta, type MetaOptions } from './runner';

/** Why a file isn't imported: not audio or a transcript, or a second file for the same call. */
export type SkipReason = 'unsupported' | 'extra_audio' | 'extra_transcript';

export interface PlannedCall {
  name: string;
  audio: string | null;
  transcript: string | null;
  /** The manifest row that describes the call. */
  manifestLine: number | null;
  phone: string | null;
  startedAt: string | null;
  direction: CallDirection | null;
  contactName: string | null;
  tags: string[];
}

export interface ImportPlan {
  calls: PlannedCall[];
  skipped: { file: string; reason: SkipReason }[];
  manifest: {
    file: string;
    issues: ManifestIssue[];
    /** Rows whose file is not in the folder. */
    unmatched: { line: number; file: string }[];
    callsWithoutRow: number;
  } | null;
}

/**
 * What an import of a folder would do, without reading a transcript or sending anything: how its
 * files pair into calls, which files are skipped, the metadata each call gets, and the manifest's
 * problems. The dry run of the agent CLI and MCP server.
 */
export function planImport(
  pairing: Pairing,
  manifest: Manifest | null,
  opts: Omit<MetaOptions, 'manifest'>,
): ImportPlan {
  const used = new Set<number>();
  const calls = pairing.items.map((item): PlannedCall => {
    const names = [item.audio?.name, item.transcript?.name].filter((n): n is string => !!n);
    const row = names.map((n) => manifest?.lookup(n)).find((r) => r !== undefined);
    if (row) used.add(row.line);
    const meta = itemMeta(item, { ...opts, manifest });
    return {
      name: item.name,
      audio: item.audio?.name ?? null,
      transcript: item.transcript?.name ?? null,
      manifestLine: row?.line ?? null,
      phone: meta.phone ?? null,
      startedAt:
        meta.startedAt instanceof Date ? meta.startedAt.toISOString() : (meta.startedAt ?? null),
      direction: meta.direction ?? null,
      contactName: meta.contactName ?? null,
      tags: [...(meta.tags ?? [])],
    };
  });
  const skipped = pairing.ignored.map((f) => {
    const kind = classifyFile(f.name);
    const reason: SkipReason =
      kind === 'audio' ? 'extra_audio' : kind === 'transcript' ? 'extra_transcript' : 'unsupported';
    return { file: f.name, reason };
  });
  return {
    calls,
    skipped,
    manifest:
      manifest && pairing.manifest
        ? {
            file: pairing.manifest.name,
            issues: manifest.issues,
            unmatched: manifest.entries
              .filter((e) => !used.has(e.line))
              .map((e) => ({ line: e.line, file: e.file })),
            callsWithoutRow: calls.filter((c) => c.manifestLine === null).length,
          }
        : null,
  };
}
