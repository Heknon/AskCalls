import type { PlannedItem } from '@askcalls/client-core/bulk/pairing';
import type { PreflightSummary } from '@askcalls/client-core/bulk/runner';
import type { IngestMeta } from '@askcalls/client-core/ingest';
import { DEFAULT_PHONE_REGION, isPhoneRegion, parsePhone } from '@askcalls/indexing';

export type GroupBy = 'contact' | 'folder' | 'month';

export type GroupLabel =
  | { kind: 'contact'; name?: string; phone?: string }
  | { kind: 'folder'; path: string }
  | { kind: 'month'; year: number; month: number }
  | { kind: 'none' };

export interface ItemGroup {
  /** Stable within one grouping: an E.164 number, `name:<lower-case name>`, a folder or `YYYY-MM`. */
  key: string;
  label: GroupLabel;
  keys: string[];
}

type Item = Pick<PlannedItem, 'key' | 'audio' | 'transcript'>;

const NONE = '';

function folderOf(item: Item): string {
  const parts = (item.audio ?? item.transcript)!.name.split(/[\\/]/);
  parts.pop();
  return parts.join('/');
}

const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Names that look the same group together: no bidi marks, one Unicode form, one case. */
const nameKey = (name: string) =>
  `name:${name.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().toLowerCase()}`;

function contactKey(meta: IngestMeta | undefined, region: string) {
  const phone = meta?.phone
    ? parsePhone(meta.phone, isPhoneRegion(region) ? region : DEFAULT_PHONE_REGION)
    : null;
  const name = meta?.contactName?.replace(INVISIBLE, '').trim() || undefined;
  if (phone) return { key: phone, label: { kind: 'contact', name, phone } as GroupLabel };
  if (name) return { key: nameKey(name), label: { kind: 'contact', name } as GroupLabel };
  return { key: NONE, label: { kind: 'none' } as GroupLabel };
}

function monthKey(meta: IngestMeta | undefined) {
  const at = meta?.startedAt ? new Date(meta.startedAt) : null;
  if (!at || Number.isNaN(at.getTime()))
    return { key: NONE, label: { kind: 'none' } as GroupLabel };
  const year = at.getFullYear();
  const month = at.getMonth() + 1;
  return {
    key: `${year}-${String(month).padStart(2, '0')}`,
    label: { kind: 'month', year, month } as GroupLabel,
  };
}

/**
 * The planned calls of an import in groups the user can include or leave out as a whole: by the
 * other party, by folder, or by month. Items with no contact or no date form one group, last.
 * By contact, calls with only a name join the one number saved under that name, if there is one.
 */
export function groupItems(
  items: readonly Item[],
  meta: ReadonlyMap<string, IngestMeta>,
  by: GroupBy,
  region: string,
): ItemGroup[] {
  const phonesByName = new Map<string, Set<string>>();
  if (by === 'contact') {
    for (const item of items) {
      const { key, label } = contactKey(meta.get(item.key), region);
      if (label.kind !== 'contact' || !label.phone || !label.name) continue;
      const n = nameKey(label.name);
      phonesByName.set(n, (phonesByName.get(n) ?? new Set()).add(key));
    }
  }
  const byContact = (m: IngestMeta | undefined) => {
    const c = contactKey(m, region);
    const phones = c.label.kind === 'contact' && !c.label.phone ? phonesByName.get(c.key) : null;
    if (phones?.size !== 1) return c;
    const phone = [...phones][0]!;
    return { key: phone, label: { ...c.label, phone } as GroupLabel };
  };
  const groups = new Map<string, ItemGroup>();
  for (const item of items) {
    const m = meta.get(item.key);
    const { key, label } =
      by === 'contact'
        ? byContact(m)
        : by === 'month'
          ? monthKey(m)
          : { key: folderOf(item), label: { kind: 'folder', path: folderOf(item) } as GroupLabel };
    const g = groups.get(key);
    if (g) {
      g.keys.push(item.key);
      if (g.label.kind === 'contact' && label.kind === 'contact' && !g.label.name && label.name) {
        g.label = { ...g.label, name: label.name };
      }
    } else groups.set(key, { key, label, keys: [item.key] });
  }
  const list = [...groups.values()];
  const last = (g: ItemGroup) => (by !== 'folder' && g.key === NONE ? 1 : 0);
  return list.sort((a, b) => {
    if (last(a) !== last(b)) return last(a) - last(b);
    if (by === 'contact') return b.keys.length - a.keys.length || (a.key < b.key ? -1 : 1);
    if (by === 'month') return a.key < b.key ? 1 : -1;
    return a.key < b.key ? -1 : 1;
  });
}

/** Whether a group is in the import: all of its calls, none, or some. */
export function groupState(keys: readonly string[], excluded: ReadonlySet<string>) {
  const out = keys.filter((k) => excluded.has(k)).length;
  return out === 0 ? true : out === keys.length ? false : ('indeterminate' as const);
}

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
