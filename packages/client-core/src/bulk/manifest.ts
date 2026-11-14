import { type CallDirection, DomainError } from '@askcalls/domain';
import { decodeText } from '@askcalls/transcript-formats';
import { baseName } from './pairing';
import { fromZonedTime } from './time-zone';

/** One `manifest.csv` row (spec 8). Values override anything parsed from file names. */
export interface ManifestEntry {
  /** 1-based line of the CSV. */
  line: number;
  file: string;
  phone: string | null;
  startedAt: string | null;
  direction: CallDirection | null;
  contactName: string | null;
  tags: string[];
}

export interface ManifestIssue {
  /** 1-based line of the CSV. */
  line: number;
  code: 'missing_file' | 'bad_date' | 'bad_direction' | 'duplicate_file';
}

export interface Manifest {
  entries: ManifestEntry[];
  issues: ManifestIssue[];
  /** Entry for a file path: exact path, then the file's name alone, then its base name. */
  lookup(path: string): ManifestEntry | undefined;
}

export const MANIFEST_COLUMNS = [
  'file',
  'phone',
  'started_at',
  'direction',
  'contact_name',
  'tags',
] as const;

/** RFC 4180 records: quoted fields, doubled quotes, CRLF or LF, commas or semicolons. */
export function parseCsv(text: string): Array<{ line: number; fields: string[] }> {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: Array<{ line: number; fields: string[] }> = [];
  let fields: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      fields.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      fields.push(field);
      if (fields.some((f) => f.trim() !== '')) rows.push({ line: rowLine, fields });
      fields = [];
      field = '';
      line++;
      rowLine = line;
    } else field += ch;
  }
  fields.push(field);
  if (fields.some((f) => f.trim() !== '')) rows.push({ line: rowLine, fields });
  return rows;
}

/** The words `direction` accepts, in any letter case. */
export const MANIFEST_DIRECTIONS: Readonly<Record<string, CallDirection>> = {
  in: 'in',
  incoming: 'in',
  inbound: 'in',
  out: 'out',
  outgoing: 'out',
  outbound: 'out',
  unknown: 'unknown',
};

/** ISO 8601 with an offset, or `YYYY-MM-DD[ HH:MM[:SS]]` read in `timeZone`. */
function parseDate(value: string, timeZone: string): string | null {
  const v = value.trim();
  const local =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?)?$/.exec(v);
  if (!local) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [y, mo, d, h, mi, s] = local.slice(1).map((x) => +(x ?? 0)) as number[];
  const wall = Date.UTC(y!, mo! - 1, d!, h, mi, s);
  if (new Date(wall).getUTCDate() !== d || h! > 23 || mi! > 59 || s! > 59) return null;
  return new Date(fromZonedTime(wall, timeZone)).toISOString();
}

/** `timeZone` (IANA, default UTC) is the zone of `started_at` values without an offset. */
export function parseManifest(
  input: string | Uint8Array,
  opts: { timeZone?: string } = {},
): Manifest {
  const timeZone = opts.timeZone ?? 'UTC';
  const rows = parseCsv(typeof input === 'string' ? input : decodeText(input));
  const header = rows.shift();
  if (!header) throw new DomainError('invalid', 'manifest is empty');
  const index = new Map(header.fields.map((h, i) => [h.trim().toLowerCase().replace(/^﻿/, ''), i]));
  if (!index.has('file')) throw new DomainError('invalid', 'manifest has no file column');

  const entries: ManifestEntry[] = [];
  const issues: ManifestIssue[] = [];
  const seen = new Set<string>();
  for (const { line, fields } of rows) {
    const col = (name: (typeof MANIFEST_COLUMNS)[number]) => {
      const i = index.get(name);
      const v = i === undefined ? '' : (fields[i] ?? '').trim();
      return v === '' ? null : v;
    };
    const file = col('file');
    if (!file) {
      issues.push({ line, code: 'missing_file' });
      continue;
    }
    if (seen.has(file.toLowerCase())) {
      issues.push({ line, code: 'duplicate_file' });
      continue;
    }
    seen.add(file.toLowerCase());
    const rawDate = col('started_at');
    const startedAt = rawDate ? parseDate(rawDate, timeZone) : null;
    if (rawDate && !startedAt) issues.push({ line, code: 'bad_date' });
    const rawDirection = col('direction');
    const direction = rawDirection
      ? (MANIFEST_DIRECTIONS[rawDirection.toLowerCase()] ?? null)
      : null;
    if (rawDirection && !direction) issues.push({ line, code: 'bad_direction' });
    entries.push({
      line,
      file,
      phone: col('phone'),
      startedAt,
      direction,
      contactName: col('contact_name'),
      tags: (col('tags') ?? '')
        .split(/[;|,]/)
        .map((t) => t.trim())
        .filter(Boolean),
    });
  }

  const byPath = new Map(entries.map((e) => [e.file.toLowerCase(), e]));
  const byName = new Map(entries.map((e) => [e.file.split(/[\\/]/).pop()!.toLowerCase(), e]));
  const byKey = new Map(entries.map((e) => [baseName(e.file).toLowerCase(), e]));
  return {
    entries,
    issues,
    lookup(path) {
      const p = path.toLowerCase();
      return (
        byPath.get(p) ??
        byName.get(p.split(/[\\/]/).pop()!) ??
        byKey.get(baseName(path).toLowerCase())
      );
    },
  };
}
