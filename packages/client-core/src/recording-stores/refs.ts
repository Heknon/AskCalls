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

type Previous = Providers['previousStores'][number];
export const isDriveConfig = (s: Previous): s is DriveConfig => 'refreshToken' in s;
/** The `bucketRef` a store's recordings carry. */
export const refOf = (s: Previous) => (isDriveConfig(s) ? driveRef(s) : s.id);

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
  if (r.mode === 'drive') {
    out.push({ kind: 'google-drive', ref: driveRef(r.drive), config: r.drive });
  }
  for (const s of p.previousStores) {
    const ref = refOf(s);
    if (out.some((k) => k.ref === ref)) continue;
    out.push(
      isDriveConfig(s)
        ? { kind: 'google-drive', ref, config: s }
        : { kind: 's3-compatible', ref, config: s },
    );
  }
  return out;
}

export function findStore(p: Providers, ref: string): KnownStore {
  const s = knownStores(p).find((k) => k.ref === ref);
  if (!s) throw new DomainError('not_found', 'this recording store is not configured');
  return s;
}
