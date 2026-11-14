import { parseRecordingFileName } from '@askcalls/client-core/bulk/filenames';
import { classifyFile, pairKey } from '@askcalls/client-core/bulk/pairing';
import type { Contact } from '@askcalls/client-core/userdata';
import type { CallDirection } from '@askcalls/domain';
import { type CountryCode, parsePhone } from '@askcalls/indexing';
import { formatPhone } from '@askcalls/ui/lib/format';

export interface Picked {
  audio: File | null;
  transcript: File | null;
}

/** How many calls the files make, paired the way bulk import pairs them. */
export function callCount(files: readonly File[]): number {
  const kinds = new Set(['audio', 'transcript']);
  return new Set(files.filter((f) => kinds.has(classifyFile(f.name))).map((f) => pairKey(f.name)))
    .size;
}

/** Adds dropped files to the current pick: the newest audio and transcript win. */
export function pickFiles(
  current: Picked,
  files: readonly File[],
): { picked: Picked; unsupported: boolean } {
  const picked = { ...current };
  let unsupported = false;
  for (const f of files) {
    const kind = classifyFile(f.name);
    if (kind === 'audio') picked.audio = f;
    else if (kind === 'transcript') picked.transcript = f;
    else unsupported = true;
  }
  return { picked, unsupported };
}

export interface SingleForm {
  phone: string;
  /** `datetime-local` value, local time: "2026-11-12T14:32". */
  startedAt: string;
  direction: CallDirection;
  contactName: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The contact saved under a number, if any. */
export function contactFor(
  contacts: readonly Contact[],
  phone: string,
  region: CountryCode,
): Contact | undefined {
  const e164 = parsePhone(phone, region);
  if (!e164) return undefined;
  return contacts.find((c) => c.phones.some((p) => parsePhone(p, region) === e164));
}

/**
 * Form defaults for picked files: number, time and name from Samsung or iPhone file names (read
 * in the browser's time zone), the file's modification time otherwise, and the saved contact's
 * name for the number.
 */
export function defaultsFor(
  picked: Picked,
  opts: { region: CountryCode; contacts: readonly Contact[]; utcOffsetMinutes: number },
): SingleForm {
  const files = [picked.audio, picked.transcript].filter((f): f is File => f !== null);
  const parsed = files
    .map((f) =>
      parseRecordingFileName(f.name, {
        region: opts.region,
        utcOffsetMinutes: opts.utcOffsetMinutes,
      }),
    )
    .find((m) => m !== null);
  const phone = parsed?.phone ?? '';
  const modified = files[0]?.lastModified;
  const startedAt = parsed?.startedAt
    ? new Date(parsed.startedAt)
    : modified
      ? new Date(modified)
      : null;
  return {
    phone: phone ? formatPhone(phone) : '',
    startedAt: startedAt ? toLocalInput(startedAt) : '',
    direction: 'unknown',
    contactName:
      parsed?.contactName ??
      (phone ? contactFor(opts.contacts, phone, opts.region)?.name : '') ??
      '',
  };
}

/** True when the field is empty (a hidden number) or holds a number that parses. */
export function phoneValid(phone: string, region: CountryCode): boolean {
  return phone.trim() === '' || parsePhone(phone, region) !== null;
}
