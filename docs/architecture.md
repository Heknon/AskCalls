# Architecture

AskCalls is a web app, an API, and a local agent around one rule: plaintext and keys stay on the user's devices. The server stores ciphertext, keyed tokens and vectors, indexes them, and returns them. This page explains how the code is organized to keep that rule and to keep every external service replaceable. The security reasoning is in the [threat model](threat-model.md); byte formats are in [packages/crypto/README.md](../packages/crypto/README.md).

## The flow of a call

```
 device (browser or agent)                          server                       storage
 ─────────────────────────                          ──────                       ───────
 parse transcript / decode audio
 normalize, tokenize, redact, chunk, embed
 tokens = HMAC(indexKey, word)
 ct = AES-GCM(DEK, transcript, meta, snippets)
 wrappedDek = AES-GCM(KEK, DEK)           ──POST /api/calls──▶  validate, scope    ──▶ Postgres + pgvector
 recording = segmented AES-GCM(DEK, opus) ──presigned PUT──────────────────────────▶ S3-compatible / disk

 search: tokens of the query + filters   ──POST /api/search─▶  one SQL query      ◀── tokens, day, tags, vectors
 decrypt the hits                         ◀── ciphertext ids ──
```

1. **Ingest** (`packages/client-core`, on the device): a transcript is parsed (`packages/transcript-formats`), or audio is decoded, resampled, fingerprinted and transcribed (through `POST /api/transcribe`, or directly with the user's own provider key). `packages/indexing` normalizes Hebrew and English text, derives keywords, contacts and intents, redacts phone numbers, emails and names, chunks the text and embeds the chunks (multilingual-e5-small on the device). Duplicates are caught before anything is uploaded by the audio and content tokens.
2. **Encrypt** (`packages/crypto`): a fresh DEK encrypts the transcript, metadata, snippets and recording; the KEK wraps the DEK; the index key turns every keyword, contact, tag and fingerprint into an 8-byte token. The device signs the call.
3. **Store**: the API receives ciphertext, tokens, the day number, a duration bucket and vectors, and stores them under the user's id. Recordings go straight from the device to the bucket with a presigned URL.
4. **Search**: the device turns the query into tokens (with fuzzy and Hebrew-prefix variants from the encrypted vocabulary), sends them with the date range, tags and an embedded query vector; the Postgres adapter answers in one SQL query; the device decrypts the results.
5. **Ask**: the device decrypts one call and, with the user's consent, sends it and the question through `POST /api/ask` (or directly to the user's own provider), wrapped as untrusted data.

## Repository

```
apps/
  web/                 Next.js 15 (App Router): marketing site, the app, API routes, remote MCP
  agent/               askcalls CLI: stdio MCP server, ingest, device linking (published to npm)
packages/
  domain/              entities, port interfaces, use cases, contract suites, the telemetry scrubber
  crypto/              key hierarchy, AEAD, unlock wrapping, blind-index tokens, ECIES, signatures
  indexing/            normalization, tokens, redaction, chunking, intents, rules
  transcript-formats/  TXT, SRT, VTT and JSON parsers
  client-core/         ingest, search, decryption, vocabulary sync, bulk queue (browser and agent)
  api-contract/        zod schemas per route and the typed client
  ui/                  shadcn/ui components, RTL-ready
  adapters/*           one package per adapter
docker/                Compose files and the image
scripts/               asset fetching, model builds, checks, release
```

Packages export TypeScript source; there is no build step between them. Next.js transpiles them for the web app, Bun runs them for the agent and scripts, and the release bundles the agent for Node.

## Boundaries

`bun run boundaries` (dependency-cruiser, `.dependency-cruiser.cjs`) fails CI when:

- `packages/domain` imports anything but its own files and zod;
- an isomorphic package (`crypto`, `indexing`, `transcript-formats`, `client-core`, `api-contract`) imports a `node:` builtin or an adapter; these run unchanged in browsers and Node 20+ with `globalThis.crypto`;
- an adapter imports another adapter (the mocks package excepted);
- anything under `packages/` imports from `apps/`;
- there is an import cycle.

## Ports and adapters

Every external service sits behind a port (an interface in `packages/domain/src/ports/`), and each implementation is its own package under `packages/adapters/`.

| Port | Adapters |
| --- | --- |
| Repositories (`UserRepository`, `KeyringRepository`, `CallRepository`, `VocabularyStore`, `UserDataStore`, `InboxRepository`, `ApiTokenRepository`, `AuditLog`, `RateLimiter`, `LocalCredentialRepository`) and `SearchIndex` | `db-postgres` (Drizzle over `pg` or PGlite, pgvector, row-level security), `mocks` (in memory) |
| `BlobStore` | `blob-s3` (AWS S3, Cloudflare R2, MinIO, Backblaze B2), `blob-fs`, `mocks` |
| `TranscriptionProvider` | `transcription-elevenlabs`, `-openai`, `-deepgram`, `-soniox`, `-openai-compatible`, `mocks` |
| `LlmProvider` | `llm-ai-sdk` (Anthropic, OpenAI, Google, OpenAI-compatible), `mocks` |
| `Telemetry` | `runtime` (none), `telemetry-otel`, `telemetry-sentry`, `telemetry-posthog`, `telemetry-umami` |
| `Scheduler`, `Clock`, `IdGenerator`, `BillingProvider` | `runtime` (Vercel Cron or in-process timer, system clock, UUIDv7, no billing) |

Client-side ports (`Embedder`, `AudioCodec`, `SecretStore`, `Unlocker`) are defined in `packages/client-core` with browser adapters in `apps/web/src/client/adapters` (transformers.js in a worker, WebCodecs with an ffmpeg.wasm fallback, IndexedDB, WebAuthn PRF) and agent adapters in `apps/agent/src/adapters` (transformers.js on Node, system ffmpeg, the OS keychain).

Each port has a contract suite in `packages/domain/test/contracts/`, and every adapter runs it: the Postgres suite on PGlite in the fast checks and on real Postgres in the integration tests, S3 against MinIO, providers against recorded responses. How to add one: [adapters.md](adapters.md).

## Composition and configuration

`apps/web/src/server/container.ts` is the composition root. It takes the resolved configuration from `ConfigService` and builds the `Ports` bundle, one builder per port in `apps/web/src/server/adapters/<port>.ts`. Nothing else constructs adapters, and nothing else reads environment variables or the config file.

Configuration resolves per setting: environment variable (which locks the setting) → the instance config file (`config.json` in the data directory, edited at `/admin/instance`) → the built-in default. Every change is validated, adapters with a health check are tested before saving, and the container rebuilds without a restart, except for the database driver. In offline mode the composition root hands every HTTP adapter a fetch that refuses hosts outside the local network, and the instance refuses to start with an adapter pointing outside it.

## The API

Each area's routes are declared once in `packages/api-contract/src/routes/<area>.ts` with `defineRoute`: method, path, auth, zod schemas for params, query, body and response. The same declaration types the client (`createApiClient().request(route, …)`) and wraps the Next.js handler (`apps/web/src/server/http/handler.ts`), which:

- authenticates a session cookie or a personal access token with the route's scope;
- rate-limits per user, per token and per IP, plus any per-route limit;
- validates input and output against the schemas (bytes travel as base64, tokens as decimal strings);
- maps `DomainError` codes to HTTP statuses with content-free messages;
- sets `Cache-Control: no-store`.

Use cases in `packages/domain/src/use-cases` take an `Actor` (the user from the session or token, never from input), scope every query by `userId`, and write content-free audit events for call reads and writes. The routes that carry plaintext (`/api/transcribe`, `/api/ask`, `/api/inbox`) stream to the provider or encrypt at once and never store or log bodies.

The remote MCP endpoint (`/api/mcp`) holds no keys: it offers inbox upload and ciphertext-free listings. The full MCP server is the agent, which holds a linked device's keys and decrypts locally.

## The web app

- **Marketing pages** (`/`, `/pricing`, `/security`, …) are public, with a per-request nonce CSP; Google One Tap may load only on `/` and `/login`.
- **The app** (`/app/**`, `/admin/**`) requires a session. `apps/web/src/middleware.ts` sets a strict per-request nonce CSP (scripts from this origin and the nonce only; `connect-src` limited to this origin, the blob storage, the model host and the user's signed own-key origins). Pages render a client session provider that lazily loads the browser client (keys, adapters, the embedding worker), and an unlock gate in front of every page.
- **Locking** wipes keys and decrypted state from memory; the service worker caches the static shell only.
- **i18n**: next-intl without locale routing, English and Hebrew, right-to-left by locale, `dir="auto"` on transcript text.

## Storage

The Postgres schema and migrations live in `packages/adapters/db-postgres` (Drizzle; raw SQL only inside the adapter for pgvector and array operators). The same schema and SQL run on server Postgres and on PGlite. Row-level security backs up the explicit `userId` filters: user-scoped transactions run as the `askcalls_app` role with `app.user_id` set for that transaction only. Migrations run before the code that needs them is deployed, and each is backward compatible with the version still serving ([deployment.md](deployment.md)).

## Quality gates

Fast checks run on every pull request and before every dev deploy, inside the job that deploys (`.github/actions/checks`): Biome, typecheck, boundaries, the dependency audit, unit and contract tests (including the leak test on in-memory and PGlite + fs storage, the CSP check of every app page through the real middleware, the telemetry contract for every backend, and the reproducible-build guard), and the bundle-size budget on a production build. Integration tests (real Postgres and MinIO) and Playwright E2E run before production and on demand (`ci.yml`). CodeQL runs weekly and on pushes to master. Releases (`release.yml`) publish client asset hashes, the npm agent, a multi-arch image and offline bundles ([reproducible-builds.md](reproducible-builds.md)).
