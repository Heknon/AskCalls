import { mkdir } from 'node:fs/promises';
import { DomainError } from '@askcalls/domain';
import type { PGlite } from '@electric-sql/pglite';
import { type SQL, sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { Pool } from 'pg';
import { schema } from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export type PostgresDatabaseConfig =
  | {
      driver: 'pg';
      /** postgres:// connection string. */
      url: string;
      /** Pool size (default 10). */
      poolMax?: number;
    }
  | {
      driver: 'pglite';
      /** Data directory; omit for an in-memory database (tests). */
      dataDir?: string;
    };

/** The role user-scoped transactions switch to. Created by migration 0001. */
export const APP_ROLE = 'askcalls_app';

/**
 * Database access with row-level security (README, "Row-level security").
 *
 * - `asUser` opens a transaction, switches to `askcalls_app` and sets `app.user_id`, so the
 *   RLS policies limit every statement to that user's rows on top of the explicit filters.
 * - `asSystem` is the deliberate bypass: it runs as the connection's own role (the table owner,
 *   which RLS does not restrict). Only lookups that happen before a user is known (sign-in,
 *   token hash, device-link join) and cross-user jobs (expiry, retention listing) use it.
 */
export interface Driver {
  readonly kind: 'pg' | 'pglite';
  readonly db: Db;
  asUser<T>(userId: string, fn: (tx: Db) => Promise<T>): Promise<T>;
  asSystem<T>(fn: (db: Db) => Promise<T>): Promise<T>;
  /** A transaction on the bypass path. */
  asSystemTx<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  /** Raw multi-statement scripts in one transaction, below Drizzle (migrations only). */
  scriptTx<T>(fn: (s: ScriptRunner) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface ScriptRunner {
  /** Runs a script that may hold several statements and no parameters. */
  exec(script: string): Promise<void>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export async function openDriver(config: PostgresDatabaseConfig): Promise<Driver> {
  if (config.driver === 'pg') {
    const [{ default: pg }, { drizzle }] = await Promise.all([
      import('pg'),
      import('drizzle-orm/node-postgres'),
    ]);
    const pool: Pool = new pg.Pool({ connectionString: config.url, max: config.poolMax ?? 10 });
    // An idle client erroring (server restart, network) must not crash the process.
    pool.on('error', () => {});
    const db = drizzle({ client: pool, schema }) as unknown as Db;
    const scriptTx: Driver['scriptTx'] = async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          exec: async (script) => {
            await client.query(script);
          },
          query: async <T>(text: string, params: unknown[] = []) =>
            (await client.query(text, params)).rows as T[],
        });
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    };
    return makeDriver('pg', db, scriptTx, () => pool.end());
  }
  const [{ PGlite }, { vector }, { drizzle }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite-pgvector'),
    import('drizzle-orm/pglite'),
  ]);
  if (config.dataDir) await mkdir(config.dataDir, { recursive: true });
  const client: PGlite = await PGlite.create({
    ...(config.dataDir ? { dataDir: config.dataDir } : {}),
    extensions: { vector },
  });
  const db = drizzle({ client, schema }) as unknown as Db;
  const scriptTx: Driver['scriptTx'] = (fn) =>
    client.transaction((tx) =>
      fn({
        exec: async (script) => {
          await tx.exec(script);
        },
        query: async <T>(text: string, params: unknown[] = []) =>
          (await tx.query<T>(text, params)).rows,
      }),
    );
  return makeDriver('pglite', db, scriptTx, () => client.close());
}

function makeDriver(
  kind: Driver['kind'],
  db: Db,
  scriptTx: Driver['scriptTx'],
  close: () => Promise<void>,
): Driver {
  return {
    kind,
    scriptTx,
    db,
    asUser: (userId, fn) => {
      if (typeof userId !== 'string' || userId.length === 0) {
        throw new DomainError('invalid', 'missing user id');
      }
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('role', ${APP_ROLE}, true), set_config('app.user_id', ${userId}, true)`,
        );
        return fn(tx as unknown as Db);
      });
    },
    asSystem: (fn) => fn(db),
    asSystemTx: (fn) => db.transaction((tx) => fn(tx as unknown as Db)),
    close,
  };
}

/** Rows of a raw statement; both drivers return `{ rows }`. */
export async function rows<T = Record<string, unknown>>(q: Db, query: SQL): Promise<T[]> {
  const result = (await q.execute(query)) as unknown as { rows: T[] };
  return result.rows;
}

/** SQLSTATE of a driver error, looking through Drizzle's wrapper. */
export function pgErrorCode(e: unknown): string | null {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur && typeof cur === 'object'; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}

export const UNIQUE_VIOLATION = '23505';
export const FOREIGN_KEY_VIOLATION = '23503';
