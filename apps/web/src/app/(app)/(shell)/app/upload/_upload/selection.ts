import type { PlannedItem } from '@askcalls/client-core/bulk/pairing';
import type { PreflightSummary } from '@askcalls/client-core/bulk/runner';

type Item = Pick<PlannedItem, 'key' | 'audio' | 'transcript'>;

export interface SelectionCounts {
  selected: number;
  total: number;
  audioOnly: number;
  paired: number;
  transcriptOnly: number;
  duplicates: number;
  minutes: number;
  unreadable: number;
  manifestCovered: number;
}

/** The pre-flight summary of the calls left in the import. */
export function selectionSummary(
  items: readonly Item[],
  summary: Pick<PreflightSummary, 'secondsByKey' | 'duplicateKeys' | 'unreadable'>,
  manifestKeys: ReadonlySet<string>,
  excluded: ReadonlySet<string>,
): SelectionCounts {
  const dup = new Set(summary.duplicateKeys);
  const unreadable = new Set(summary.unreadable);
  const c: SelectionCounts = {
    selected: 0,
    total: items.length,
    audioOnly: 0,
    paired: 0,
    transcriptOnly: 0,
    duplicates: 0,
    minutes: 0,
    unreadable: 0,
    manifestCovered: 0,
  };
  let seconds = 0;
  for (const i of items) {
    if (excluded.has(i.key)) continue;
    c.selected++;
    if (i.audio && i.transcript) c.paired++;
    else if (i.audio) {
      c.audioOnly++;
      seconds += summary.secondsByKey[i.key] ?? 0;
    } else c.transcriptOnly++;
    if (dup.has(i.key)) c.duplicates++;
    if (unreadable.has(i.key)) c.unreadable++;
    if (manifestKeys.has(i.key)) c.manifestCovered++;
  }
  c.minutes = Math.ceil(seconds / 60);
  return c;
}
