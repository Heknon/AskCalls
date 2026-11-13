/** Audit log filters that the API doesn't take: who acted, and how far back. */

export type ActorKind = 'session' | 'token' | 'agent' | 'system';
export type Period = 'all' | 'day' | 'week' | 'month';

export const PERIOD_MS: Record<Period, number | null> = {
  all: null,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
};

export function actorKind(actor: string): ActorKind {
  if (actor.startsWith('token:')) return 'token';
  if (actor.startsWith('agent:')) return 'agent';
  return actor === 'system' ? 'system' : 'session';
}

export interface AuditItem {
  at: Date;
  actor: string;
}

/**
 * The loaded events that pass the filters, and whether loading more can add any: events are
 * newest first, so once the oldest loaded one is past the period, the rest are too.
 */
export function applyFilters<T extends AuditItem>(
  items: readonly T[],
  f: { actor: ActorKind | 'any'; period: Period },
  now: number,
  hasMore: boolean,
): { shown: T[]; canLoadMore: boolean } {
  const span = PERIOD_MS[f.period];
  const since = span === null ? null : now - span;
  const shown = items.filter(
    (e) =>
      (f.actor === 'any' || actorKind(e.actor) === f.actor) &&
      (since === null || e.at.getTime() >= since),
  );
  const oldest = items.at(-1);
  const pastPeriod = since !== null && oldest !== undefined && oldest.at.getTime() < since;
  return { shown, canLoadMore: hasMore && !pastPeriod };
}
