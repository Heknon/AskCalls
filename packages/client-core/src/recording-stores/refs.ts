import { DomainError } from '@askcalls/domain';
import type { Providers } from '../userdata';

/**
 * A call's `bucketRef` names the store that holds its recording: null for the instance bucket,
 * the bucket's id for an S3-compatible bucket (as before Drive existed), `gdrive:<id>` for Drive.
 */
export const DRIVE_REF_PREFIX = 'gdrive:';

export type BucketConfig = Extract<Providers['recordings'], { mode: 'own' }>['bucket'];
export type DriveConfig = Extract<Providers['recordings'], { mode: 'drive' }>['drive'];

export type KnownStore =
  | { kind: 's3-compatible'; ref: string; config: BucketConfig }
  | { kind: 'google-drive'; ref: string; config: DriveConfig };

export const driveRef = (d: Pick<DriveConfig, 'id'>) => `${DRIVE_REF_PREFIX}${d.id}`;
export const isDriveRef = (ref: string) => ref.startsWith(DRIVE_REF_PREFIX);

/** Where new recordings go: null for the instance bucket, undefined when backups are off. */
export function activeStoreRef(p: Providers): string | null | undefined {
  const r = p.recordings;
  if (r.mode === 'own') return r.bucket.id;
  if (r.mode === 'drive') return driveRef(r.drive);
  return r.mode === 'managed' ? null : undefined;
}

/** The active own store first, then the ones switched away from. */
export function knownStores(p: Providers): KnownStore[] {
  const out: KnownStore[] = [];
  const r = p.recordings;
  if (r.mode === 'own') out.push({ kind: 's3-compatible', ref: r.bucket.id, config: r.bucket });
  if (r.mode === 'drive')
    out.push({ kind: 'google-drive', ref: driveRef(r.drive), config: r.drive });
  for (const b of p.previousStores.buckets) {
    if (!out.some((s) => s.ref === b.id)) out.push({ kind: 's3-compatible', ref: b.id, config: b });
  }
  for (const d of p.previousStores.drives) {
    const ref = driveRef(d);
    if (!out.some((s) => s.ref === ref)) out.push({ kind: 'google-drive', ref, config: d });
  }
  return out;
}

export function findStore(p: Providers, ref: string): KnownStore {
  const s = knownStores(p).find((k) => k.ref === ref);
  if (!s) throw new DomainError('not_found', 'this recording store is not configured');
  return s;
}

/**
 * Switches where new recordings go. The own store switched away from is kept in
 * `previousStores` so its recordings stay readable; the one switched to leaves that list.
 */
export function switchRecordings(p: Providers, next: Providers['recordings']): Providers {
  const buckets = [...p.previousStores.buckets];
  const drives = [...p.previousStores.drives];
  const r = p.recordings;
  if (r.mode === 'own' && !buckets.some((b) => b.id === r.bucket.id)) buckets.push(r.bucket);
  if (r.mode === 'drive' && !drives.some((d) => d.id === r.drive.id)) drives.push(r.drive);
  return {
    ...p,
    recordings: next,
    previousStores: {
      buckets: buckets.filter((b) => !(next.mode === 'own' && next.bucket.id === b.id)).slice(-8),
      drives: drives.filter((d) => !(next.mode === 'drive' && next.drive.id === d.id)).slice(-8),
    },
  };
}

/** Forgets a store (after its recordings moved away, or on disconnect). */
export function forgetStore(p: Providers, ref: string): Providers {
  const active = activeStoreRef(p);
  return {
    ...p,
    recordings: active === ref ? { mode: 'managed' } : p.recordings,
    previousStores: {
      buckets: p.previousStores.buckets.filter((b) => b.id !== ref),
      drives: p.previousStores.drives.filter((d) => driveRef(d) !== ref),
    },
  };
}

/** Records the Drive folder a device created, on whichever entry holds that Drive. */
export function withDriveFolder(p: Providers, ref: string, folderId: string): Providers {
  const set = (d: DriveConfig) => (driveRef(d) === ref ? { ...d, folderId } : d);
  return {
    ...p,
    recordings:
      p.recordings.mode === 'drive'
        ? { mode: 'drive', drive: set(p.recordings.drive) }
        : p.recordings,
    previousStores: { ...p.previousStores, drives: p.previousStores.drives.map(set) },
  };
}
