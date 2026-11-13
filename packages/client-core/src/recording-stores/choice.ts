import type { Providers } from '../userdata';
import { activeStoreRef, type BucketConfig, isDriveConfig, refOf } from './refs';

/** The last bucket and the last Drive switched away from. */
export const previousBucket = (p: Providers) =>
  p.previousStores.filter((s): s is BucketConfig => !isDriveConfig(s)).at(-1);
export const previousDrive = (p: Providers) => p.previousStores.filter(isDriveConfig).at(-1);

/**
 * Switches where new recordings go. The own store switched away from is kept in
 * `previousStores` so its recordings stay readable; the one switched to leaves that list.
 */
export function switchRecordings(p: Providers, next: Providers['recordings']): Providers {
  const r = p.recordings;
  const leaving = r.mode === 'own' ? r.bucket : r.mode === 'drive' ? r.drive : null;
  const nextRef = activeStoreRef({ ...p, recordings: next });
  const kept = p.previousStores.filter((s) => refOf(s) !== nextRef);
  if (leaving && !kept.some((s) => refOf(s) === refOf(leaving))) kept.push(leaving);
  return { ...p, recordings: next, previousStores: kept.slice(-16) };
}

/** Forgets a store (on disconnect). The instance bucket takes over when it was active. */
export function forgetStore(p: Providers, ref: string): Providers {
  return {
    ...p,
    recordings: activeStoreRef(p) === ref ? { mode: 'managed' } : p.recordings,
    previousStores: p.previousStores.filter((s) => refOf(s) !== ref),
  };
}
