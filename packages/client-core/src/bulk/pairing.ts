import { extensionOf, TRANSCRIPT_EXTENSIONS } from '@askcalls/transcript-formats';

/** A file the queue knows by reference only (a handle id or a path), never by content. */
export interface FileRef {
  /** Opaque handle the adapter resolves: an IndexedDB handle key, a path, a ZIP entry name. */
  ref: string;
  /** Path relative to the picked folder or ZIP, `/`-separated. */
  name: string;
  size: number;
}

export const AUDIO_EXTENSIONS = [
  'mp3',
  'm4a',
  'aac',
  'wav',
  'ogg',
  'oga',
  'opus',
  'webm',
  'flac',
  'amr',
  '3gp',
  'mp4',
  'caf',
] as const;

export const MANIFEST_NAME = 'manifest.csv';

const TRANSCRIPT_SUFFIX = /(?:[.\-_ ]transcript|_tx)$/i;

export type FileKind = 'audio' | 'transcript' | 'manifest' | 'other';

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function dirName(path: string): string {
  const parts = path.split(/[\\/]/);
  parts.pop();
  return parts.join('/');
}

function extension(path: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function classifyFile(path: string): FileKind {
  if (fileName(path).toLowerCase() === MANIFEST_NAME) return 'manifest';
  const ext = extension(path);
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return 'audio';
  return TRANSCRIPT_EXTENSIONS.includes(extensionOf(path)) ? 'transcript' : 'other';
}

/**
 * The pairing key of a file (spec 8): its name without the extension and without a
 * `.transcript`, `-transcript` or `_tx` suffix, compared case-insensitively.
 */
export function baseName(path: string): string {
  const name = fileName(path);
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return stem.replace(TRANSCRIPT_SUFFIX, '').trim();
}

/** Pairs within one folder: `a/x.mp3` and `b/x.txt` are separate calls. */
export function pairKey(path: string): string {
  const dir = dirName(path);
  const base = baseName(path).toLowerCase();
  return dir ? `${dir.toLowerCase()}/${base}` : base;
}

export interface PlannedItem {
  key: string;
  /** Display name: the base name. */
  name: string;
  audio: FileRef | null;
  transcript: FileRef | null;
}

export interface Pairing {
  items: PlannedItem[];
  manifest: FileRef | null;
  /** Files that are neither audio nor transcripts, and extra files for an already-filled slot. */
  ignored: FileRef[];
}

export function pairFiles(files: readonly FileRef[]): Pairing {
  const byKey = new Map<string, PlannedItem>();
  const ignored: FileRef[] = [];
  let manifest: FileRef | null = null;
  const sorted = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const f of sorted) {
    const kind = classifyFile(f.name);
    if (kind === 'manifest' && !manifest) {
      manifest = f;
      continue;
    }
    if (kind !== 'audio' && kind !== 'transcript') {
      ignored.push(f);
      continue;
    }
    const key = pairKey(f.name);
    let item = byKey.get(key);
    if (!item) {
      item = { key, name: baseName(f.name), audio: null, transcript: null };
      byKey.set(key, item);
    }
    if (item[kind]) ignored.push(f);
    else item[kind] = f;
  }
  return { items: [...byKey.values()], manifest, ignored };
}
