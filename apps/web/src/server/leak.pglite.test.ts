import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FsBlobStore } from '@askcalls/adapter-blob-fs';
import { openTestDatabase, type TestDatabase } from '@askcalls/adapter-db-postgres/test-support';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type BlobTransport, type ClientHarness, startClientHarness } from './testing/client';
import { dump, findLeaks, needles, seedLeakData } from './testing/leak';

/**
 * The leak test (spec 2 rule 7, 13) on the storage self-hosted and local instances use: the
 * Postgres adapters on PGlite and the fs blob store in a temporary directory. After the same
 * seed as leak.test.ts, it dumps every row of every table in the database (bytea as raw bytes)
 * and every file under the blob directory, signing key included, and searches them.
 */

const APP_URL = 'http://localhost';

/** What the /api/blob route does with a presigned URL: verify the signature, then read or write. */
function fsTransport(store: FsBlobStore): BlobTransport {
  const resolve = async (method: 'PUT' | 'GET', url: string, contentLength: number | null) => {
    const u = new URL(url);
    const blobKey = decodeURIComponent(u.pathname.slice('/api/blob/'.length));
    const check = await store.verifyPresigned({
      method,
      blobKey,
      query: u.searchParams,
      contentLength,
    });
    if (!check.ok) throw new Error(`presigned URL rejected: ${check.reason}`);
    return blobKey;
  };
  return {
    uploader: {
      async put(req: { url: string }, body: Uint8Array) {
        await store.put(await resolve('PUT', req.url, body.length), body);
      },
    },
    fetcher: {
      async get(req: { url: string }) {
        const data = await store.get(await resolve('GET', req.url, null));
        if (!data) throw new Error('blob not found');
        return new Uint8Array(data);
      },
    },
  };
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

let h: ClientHarness;
let database: TestDatabase;
let blobDir: string;
let tables: Map<string, Record<string, unknown>[]>;
let blobFiles: Map<string, Buffer>;

beforeAll(async () => {
  database = await openTestDatabase({ driver: 'pglite' });
  blobDir = await mkdtemp(join(tmpdir(), 'askcalls-leak-'));
  const blobs = new FsBlobStore({ dir: blobDir, baseUrl: APP_URL });
  const { migrate: _m, serverInfo: _s, close: _c, ...repos } = database.db;
  h = await startClientHarness({
    adapters: { ...repos, blobs },
    transport: fsTransport(blobs),
  });
  await seedLeakData(h);

  tables = await database.driver.scriptTx(async (q) => {
    const names = await q.query<{ name: string }>(
      `SELECT quote_ident(schemaname) || '.' || quote_ident(tablename) AS name
         FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')`,
    );
    const out = new Map<string, Record<string, unknown>[]>();
    for (const { name } of names) out.set(name, await q.query(`SELECT * FROM ${name}`));
    return out;
  });
  blobFiles = new Map();
  for (const f of await filesUnder(blobDir)) blobFiles.set(f, await readFile(f));
}, 60_000);

afterAll(async () => {
  h?.app.close();
  await database?.db.close();
  if (blobDir) await rm(blobDir, { recursive: true, force: true });
});

const rowsOf = (table: string) => tables.get(`public."${table}"`) ?? tables.get(`public.${table}`);

describe('leak test on PGlite and fs storage (spec 2 rule 7)', () => {
  it('seeded every store through the full pipeline', () => {
    expect(rowsOf('Call')).toHaveLength(5);
    expect(rowsOf('CallChunk')!.length).toBeGreaterThanOrEqual(5);
    expect(rowsOf('VocabDelta')!.length).toBeGreaterThan(0);
    expect(rowsOf('UserData')!.length).toBeGreaterThanOrEqual(4);
    expect(rowsOf('InboxItem')).toHaveLength(0);
    expect(rowsOf('AuditEvent')!.length).toBeGreaterThan(0);
    const recordings = rowsOf('Call')!.filter((c) => c.recordingKey);
    expect(recordings).toHaveLength(1);
    expect([...blobFiles.keys()].some((f) => f.endsWith('.blob'))).toBe(true);
  });

  it('finds no seeded word, name or number in any table or blob file', () => {
    const list = needles();
    expect(list.length).toBeGreaterThan(40);
    const db = dump([...tables.entries()]);
    const files = Buffer.concat([...blobFiles.values()].flatMap((b) => [b, Buffer.from([0])]));
    for (const c of rowsOf('Call')!) {
      expect(db.includes(Buffer.from(c.transcriptCt as Uint8Array))).toBe(true);
    }
    expect(findLeaks(db, list)).toEqual([]);
    expect(findLeaks(files, list)).toEqual([]);
    expect(findLeaks(dump(h.app.ports.recordedTelemetry), list)).toEqual([]);
  });
});
