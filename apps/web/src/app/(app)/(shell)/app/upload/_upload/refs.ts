import type { FileRef } from '@askcalls/client-core/bulk/pairing';
import type { BulkItemState, BulkState } from '@askcalls/client-core/bulk/queue';

/** Stored or skipped: the item no longer needs its files. */
const settled = (s: BulkItemState['status']) => s === 'done' || s === 'duplicate';

/**
 * Where a reference's content lives: one picked folder (`dir:<id>`), one page's files
 * (`file:<session>`) or one ZIP (`zip:<session>:<name>`). A source is available or not as a whole.
 */
export function sourceOf(ref: string): string {
  if (ref.startsWith('zip:')) return ref.slice(0, ref.indexOf('!'));
  const second = ref.indexOf(':', ref.indexOf(':') + 1);
  return second < 0 ? ref : ref.slice(0, second);
}

/** The references the rest of a batch still needs, one per source. */
export function pendingSources(state: BulkState): Map<string, FileRef> {
  const out = new Map<string, FileRef>();
  const add = (f: FileRef | null) => {
    if (f && !out.has(sourceOf(f.ref))) out.set(sourceOf(f.ref), f);
  };
  for (const item of state.items) {
    if (settled(item.status)) continue;
    add(item.audio);
    add(item.transcript);
  }
  if (out.size > 0) add(state.manifest);
  return out;
}

const fileName = (path: string) => path.split('/').pop()!.toLowerCase();

/**
 * Points a batch at files picked again after a reload: by path inside the folder or ZIP, then by
 * file name. Items whose files are not among them keep their old references.
 */
export function remapRefs(
  state: BulkState,
  picked: readonly FileRef[],
): { state: BulkState; matched: number; unmatched: number } {
  const byPath = new Map(picked.map((f) => [f.name.toLowerCase(), f]));
  const byName = new Map<string, FileRef | null>();
  for (const f of picked) {
    const n = fileName(f.name);
    byName.set(n, byName.has(n) ? null : f);
  }
  let matched = 0;
  let unmatched = 0;
  const swap = (f: FileRef | null): FileRef | null => {
    if (!f) return f;
    const found = byPath.get(f.name.toLowerCase()) ?? byName.get(fileName(f.name)) ?? null;
    if (found && found.size === f.size) {
      matched++;
      return { ...found, name: f.name };
    }
    unmatched++;
    return f;
  };
  const next = structuredClone(state);
  for (const item of next.items) {
    if (settled(item.status)) continue;
    item.audio = swap(item.audio);
    item.transcript = swap(item.transcript);
  }
  if (next.manifest) {
    const m =
      byPath.get(next.manifest.name.toLowerCase()) ?? byName.get(fileName(next.manifest.name));
    if (m) next.manifest = { ...m, name: next.manifest.name };
  }
  return { state: next, matched, unmatched };
}
