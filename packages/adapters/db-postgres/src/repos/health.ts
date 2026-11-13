import type { HealthResult } from '@askcalls/domain';
import { sql } from 'drizzle-orm';
import type { Driver } from '../driver';

/** One round trip. The message is content-free by construction. */
export async function healthCheck(d: Driver): Promise<HealthResult> {
  const started = performance.now();
  try {
    await d.asSystem((db) => db.execute(sql`SELECT 1`));
    return {
      ok: true,
      message: d.kind === 'pg' ? 'connected' : 'pglite open',
      latencyMs: Math.round(performance.now() - started),
    };
  } catch {
    return { ok: false, message: 'database unreachable' };
  }
}
