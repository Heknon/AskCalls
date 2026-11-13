# @askcalls/adapter-db-postgres

Every Postgres-backed port (spec 3.2): `UserRepository` (with Auth.js accounts and verification
tokens), `KeyringRepository` (with device keys and device-link sessions), `CallRepository`,
`SearchIndex`, `VocabularyStore`, `UserDataStore`, `InboxRepository`, `ApiTokenRepository`,
`AuditLog` and the `postgres` `RateLimiter`.

```ts
import { createPostgresDatabase } from '@askcalls/adapter-db-postgres';

const db = await createPostgresDatabase({ driver: 'pg', url: process.env.DATABASE_URL! });
// or: { driver: 'pglite', dataDir: '/home/me/.askcalls/db' }  (omit dataDir for in-memory)
await db.migrate(); // idempotent
await db.calls.get(userId, callId);
await db.close();
```

Two drivers share one schema and the same SQL:

| Driver | Used for | Client |
| --- | --- | --- |
| `pg` | Server Postgres 16+ with pgvector ≥ 0.7 (`halfvec`): Neon, Docker, CI | `pg` (node-postgres) pool |
| `pglite` | Local mode (spec 11.2c) and the fast contract tests | `@electric-sql/pglite` + `@electric-sql/pglite-pgvector` (pgvector 0.8.7) |

Only SQL that PGlite runs is used; the contract suites run on both drivers.

## ORM decision: Drizzle, not Prisma

The spec prefers Prisma and asks to verify early that Prisma reaches PGlite through
`pglite-prisma-adapter` with migrations and raw queries, and to switch to Drizzle otherwise.
Checked on 2026-11-13 with `prisma@7.10.1`, `@prisma/client@7.10.1`,
`pglite-prisma-adapter@0.7.2`, `@electric-sql/pglite@0.5.16`:

| Check | Result |
| --- | --- |
| `prisma generate` (`prisma-client` generator, Prisma 7 config) | Works |
| Client CRUD through `new PrismaPGlite(pglite)`, `bigint[]` round trip | Works |
| `$queryRaw` / `$executeRaw` with `halfvec`, `&&`, interactive transaction with `set_config` | Works |
| `prisma migrate deploy` / `migrate dev` against PGlite | **Not supported.** Prisma 7's `prisma.config.ts` has no driver-adapter hook for the migrate commands (only `datasource.url`), so the CLI needs a TCP server (`P1001: Can't reach database server`). The adapter's own README: "Support for `prisma migrate dev` and `prisma migrate deploy` is planned for future updates"; its documented `migrate.adapter` config is the Prisma 6 early-access API that Prisma 7 removed. |
| `halfvec(384)` column | Only as `Unsupported("halfvec(384)")`: every `CallChunk` query is raw SQL anyway |

So Prisma would need a hand-written migration runner for local mode, plus a code-generation
step (the repo exports TypeScript source with no build step) and a second, generated client
to ship in the Next.js standalone build. Drizzle has a first-party PGlite driver
(`drizzle-orm/pglite`) next to `drizzle-orm/node-postgres`, needs no code generation, and its
`sql` template covers the pgvector and array operators. **Decision: Drizzle (`drizzle-orm`
0.45.4).** It stays inside this package; nothing else imports it, and the domain is unaffected.

## Layout

| Path | What |
| --- | --- |
| `src/index.ts` | `createPostgresDatabase(config)` → all ports + `migrate()` + `close()` |
| `src/driver.ts` | Opens `pg` or PGlite, the RLS transaction helpers (`asUser`, `asSystem`) |
| `src/schema.ts` | Drizzle table definitions mirroring the migrations (types only) |
| `src/migrations/` | Committed SQL migrations, one file each, listed in `index.ts` |
| `src/migrate.ts` | The migration runner; `src/migrate-cli.ts` runs it from a shell |
| `src/repos/*.ts` | One file per port |
| `src/*.test.ts` | Contract suites, RLS and migration tests on PGlite (`bun run test`) |
| `src/*.int.test.ts` | The same suites on real Postgres, and the 10,000-call search benchmark |

## Schema (migration `0001_init`, spec 5)

Ciphertext columns are `*Ct bytea`, HMAC tokens `*Tok bigint`. Ids are `text COLLATE "C"` so
keyset cursors compare bytewise, exactly like the in-memory mock. Every timestamp is written
from JavaScript (millisecond precision), never `now()`, so cursors built from returned rows
round-trip exactly.

| Table | Columns (beyond spec 5) | Indexes and constraints |
| --- | --- | --- |
| `User` | `role`, `locale`, `telemetryConsent jsonb`, `retentionDays` | unique `email`; partial index for retention |
| `Account` | Auth.js `userId, type, provider, providerAccountId`; OAuth tokens are not stored | PK `(provider, providerAccountId)`, `(userId)` |
| `VerificationToken` | `identifier, token, expires` | PK `(identifier, token)` |
| `Keyring`, `UserKeys`, `DeviceKey` | as spec | `(userId)` |
| `DeviceLinkSession` | `secretHash, state, devicePublicKey, deviceLabel, deviceSigningPublicKey`, `encryptedRootKey, expiresAt` | `(userId)`, `(expiresAt)` |
| `Call` | recording ref as `recordingBucketRef, recordingKey, recordingBytes`; `totalRecordingBytes` sums the instance bucket (`recordingBucketRef IS NULL`) only; a call id taken by any user is a `conflict`, never overwritten | GIN `keywordToks`, GIN `tagToks`, `(userId, day DESC, id DESC)`, `(userId, contactTok)`, unique `(userId, audioTok)`, unique `(userId, contentTok)`, unique `(id, userId)` |
| `CallChunk` | PK `(callId, ord)` instead of a surrogate id | HNSW `embedding halfvec_cosine_ops`, `(userId)`; FK `(callId, userId)` → `Call(id, userId)` so a chunk can't belong to another user than its call |
| `VocabDelta` | as spec | unique `(userId, seq)` |
| `UserData` | as spec | PK `(userId, kind)` |
| `InboxItem` | as spec | `(userId, createdAt)`, `(expiresAt)`; check payload or blob key present |
| `ApiToken` | `fetchesThisHour`, `hourWindowStart` | unique `tokenHash`, `(userId)` |
| `AuditEvent` | `actor`, `action` as text (no enum, so new actions need no migration); `callId` without a foreign key (the trail outlives the call) | `(userId, at DESC, id DESC)`, `(userId, action, at DESC, id DESC)` |
| `RateBucket` | `key, windowStart, count`: sliding-window `hit` buckets and fixed-window quota counters (`consume` is one atomic upsert, `usage` one read) | PK `(key, windowStart)` |

Every user-owned table references `User` with `ON DELETE CASCADE`, so `deleteHard` is one
`DELETE` (blob cleanup is the use case's job). Check constraints mirror the domain enums.

## Row-level security

Every query filters by `userId` explicitly. RLS is the second line of defense (spec 5):

- Migration `0001` creates the role **`askcalls_app`** (`NOLOGIN NOBYPASSRLS`), grants it to
  the migrating user, and grants it `SELECT, INSERT, UPDATE, DELETE` on the user-owned tables.
- Each user-owned table has RLS enabled and one policy for `askcalls_app`:
  `USING ("userId" = current_setting('app.user_id', true)) WITH CHECK (same)` (`"id"` on
  `User`). With `app.user_id` unset, `current_setting` is null and nothing matches.
- **User-scoped path** (`Driver.asUser(userId, fn)`): every port method that takes a `userId`
  opens a transaction and runs
  `SELECT set_config('role', 'askcalls_app', true), set_config('app.user_id', $1, true)`
  first. Both settings are transaction-local, so a pooled connection never carries them into
  the next request.
- **Bypass path** (`Driver.asSystem`, `asSystemTx`): runs as the connection's own role, which
  owns the tables. RLS is enabled but not forced, so the owner (and a superuser, as on PGlite)
  is not restricted. It is used only where no user is known yet, or the job is cross-user:

  | Method | Why |
  | --- | --- |
  | `users.findByEmail`, `findByAccount`, `unlinkAccount`, `count`, `listWithRetention`, verification tokens | Sign-in runs before a user id is known; counts and the retention job span users |
  | `apiTokens.findByHash`, `touch`, `incrementFetches` | Authenticating a request; the port passes only the token id |
  | `keyring.getLinkSession`, `updateLinkSession`, `deleteExpiredLinkSessions` | The joining device has no session; expiry spans users |
  | `inbox.deleteExpired` | Expiry job across users |
  | `rateLimiter.hit` | Keys are not user-owned (IPs, token ids) |
  | `migrate()` | DDL |

  New code takes the bypass only through these helpers, so a review can find every use with
  `grep asSystem`.
- The tests (`rls.test.ts`, and the `pg` run in `contracts.int.test.ts`) check that RLS and a
  policy exist on every user-owned table, that a raw query as `askcalls_app` without
  `app.user_id` returns no rows, that a user sees and can change only their own rows, and that
  the settings don't outlive the transaction.

Requirements: the migrating role needs `CREATEROLE` the first time (Neon's owner role and the
Docker `postgres` image have it; roles are cluster-wide, so a second database on the same server
reuses `askcalls_app`), and the `vector` extension must be creatable or already created. The
integration tests run as a non-superuser owner with `CREATEROLE` to match managed Postgres.

## Search (spec 9.1)

`SearchIndex.search` is one SQL statement per query. Predicates on `"Call"`: `userId = $1`;
each keyword group `keywordToks && $g::bigint[]` (AND across groups, OR within); contacts
`contactTok = ANY($c)`; tags `tagToks @> $t`; excluded tags `NOT (tagToks && $x)`; day range.

- **Without a vector:** `ORDER BY day DESC, id DESC`, keyset cursor `(day, id) < ($d, $id)`.
- **With a vector:** `CROSS JOIN LATERAL` picks each matching call's nearest chunk
  (`embedding <=> $v::halfvec(384)`, ties by `ord`), ordered by that distance then id; the hit
  carries the chunk's `snippetCt`, `ord` and `score = 1 − cosine distance`. Calls without
  chunks are left out (as in the mock). Keyset cursor `(dist, id)` on the exact float distance.

The vector path computes the exact distance for every chunk of the calls that pass the
filters, so results are complete and pages are stable; the HNSW index (kept per spec 5) is not
used by this query shape, because an approximate top-k cannot be paged or combined with
arbitrary filters exactly. At the free tier (500 calls) and the spec 13 benchmark size
(10,000 calls) the exact scan is within budget:

`search-perf.int.test.ts`, one user with 10,000 calls (120 keyword tokens each) and 50,000
chunks, timed around the adapter call (RLS transaction and driver round trips included),
measured 2026-11-13 on a shared cloud container (PGlite 0.5.16 in-process; local Postgres 16.15
with pgvector 0.8.7, default settings):

| Query | PGlite p50 / p95 | Postgres p50 / p95 |
| --- | --- | --- |
| No filters, newest first | 3.5 / 5.2 ms | 2.5 / 3.6 ms |
| Two keyword groups (OR variants) + tag | 21 / 25 ms | 28 / 29 ms |
| Keyword + contacts + day range + excluded tag | 2.0 / 3.6 ms | 1.3 / 2.0 ms |
| Vector over all 10,000 calls (50,000 distances) | 145 / 157 ms | 85 / 100 ms |
| Vector + keyword group | 22 / 23 ms | 18 / 20 ms |

All are under the 300 ms budget (spec 13). The unfiltered vector query grows linearly with the
number of chunks; past roughly 100,000 chunks per user it needs an HNSW candidate stage
(`hnsw.iterative_scan`), which would make deep pages approximate. Seeding the PGlite run drops
the HNSW index first, because maintaining it for 50,000 single-threaded WASM inserts takes over
ten minutes; the query plan doesn't use it either way. Run it with
`bun run test:integration -- --disableConsoleIntercept packages/adapters/db-postgres/src/search-perf`
to see the timings.

## Migrations

- Committed SQL in `src/migrations/NNNN_name.ts` (a TypeScript string, so the SQL ships inside
  the Next.js server bundle without file tracing), listed in order in `src/migrations/index.ts`.
- `migrate()` runs all pending migrations in **one transaction** under
  `pg_advisory_xact_lock`, records each in `"_Migration"` with a SHA-256 checksum, and refuses
  to run when an applied migration was edited or the database has one the build doesn't know.
- Who runs it (`apps/web/src/server/adapters/database.ts`):
  - local mode (`pglite`): always, on boot;
  - Docker self-host (`postgres`): on boot, because `docker/docker-compose.yml` sets the config
    flag `DB_MIGRATE_ON_BOOT=true` (`db.migrateOnBoot`, default false). The runtime image has
    no Bun or sources, so the app migrates itself rather than an entrypoint script; the
    advisory lock makes several containers starting at once safe;
  - hosted (Vercel + Neon) and CI: before the new code goes live, with
    `DATABASE_URL=… bun run --cwd packages/adapters/db-postgres migrate` (flag left off).
- Policy (CLAUDE.md, spec 14.1): never edit a migration that reached `dev`; add a new one.
  Every migration must work with the release still serving: add columns nullable or with
  defaults, rename or drop across two releases, no `CREATE INDEX CONCURRENTLY` (the runner is
  transactional). A new user-owned table needs `userId`, RLS enabled, the `_owner` policy and
  a grant to `askcalls_app` in the same migration.

## Tests

```sh
bun run test                     # contract suites, RLS, migrations on PGlite (in-memory)
bun run test:integration         # the same on Postgres (Testcontainers pgvector/pgvector:pg17)
ASKCALLS_TEST_PG_URL=postgres://postgres:pw@localhost:5432/postgres bun run test:integration
                                 # …or on an existing server (superuser URL; a fresh database per suite)
```
