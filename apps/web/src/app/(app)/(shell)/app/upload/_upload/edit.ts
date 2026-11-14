import type { IngestMeta, MetaEdits } from '@askcalls/client-core/ingest';
import type { CallDirection } from '@askcalls/domain';
import { DEFAULT_PHONE_REGION, isPhoneRegion, parsePhone } from '@askcalls/indexing';
import { formatPhone } from '@askcalls/ui/lib/format';
import { fromLocalInput, toLocalInput } from './single';

export interface EditValues {
  phone: string;
  contactName: string;
  startedAt: string;
  direction: CallDirection;
}

function fieldsOf(m: IngestMeta | undefined, region: string): EditValues {
  const r = isPhoneRegion(region) ? region : DEFAULT_PHONE_REGION;
  const e164 = m?.phone ? parsePhone(m.phone, r) : null;
  const at = m?.startedAt ? new Date(m.startedAt) : null;
  return {
    phone: e164 ? formatPhone(e164) : (m?.phone ?? ''),
    contactName: m?.contactName ?? '',
    startedAt: at && !Number.isNaN(at.getTime()) ? toLocalInput(at) : '',
    direction: m?.direction ?? 'unknown',
  };
}

/** The dialog's fields for some planned calls: a field the calls disagree on is left out. */
export function editValues(
  keys: readonly string[],
  meta: ReadonlyMap<string, IngestMeta>,
  region: string,
): Partial<EditValues> {
  const [first, ...rest] = keys.map((k) => fieldsOf(meta.get(k), region));
  if (!first) return {};
  const out: Partial<EditValues> = {};
  for (const f of Object.keys(first) as (keyof EditValues)[]) {
    if (rest.every((v) => v[f] === first[f])) Object.assign(out, { [f]: first[f] });
  }
  return out;
}

/** The fields the user changed, as edits: empty means none. */
export function toEdits(changed: Partial<EditValues>): MetaEdits {
  const out: MetaEdits = {};
  if (changed.phone !== undefined) out.phone = changed.phone.trim() || null;
  if (changed.contactName !== undefined) out.contactName = changed.contactName.trim() || null;
  if (changed.startedAt !== undefined) {
    out.startedAt = fromLocalInput(changed.startedAt)?.toISOString() ?? null;
  }
  if (changed.direction !== undefined) out.direction = changed.direction;
  return out;
}
