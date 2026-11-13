# Progress

## M0: Monorepo scaffold

- Bun workspaces and Turborepo; Biome for lint and format; dependency-cruiser boundaries (`bun run boundaries`).
- `packages/domain`: entities, every server port from spec 3.2, the `Ports` bundle, limits, and a contract suite per port in `test/contracts/`.
- `packages/adapters/mocks`: in-memory adapters for every port, passing every contract suite. `packages/adapters/runtime`: system clock and ids, `none` telemetry and billing, `vercel-cron` and `in-process` schedulers.
- Client-side ports (`Embedder`, `AudioCodec`, `SecretStore`, `Unlocker`) in `packages/client-core`.
- `packages/api-contract`: wire encodings (base64 bytes, decimal int64 tokens) and `defineRoute`.
- `apps/web`: Next.js 15 shell, `ConfigService` (env → config.json → defaults, env locks, owner-only writes, change notifications), composition root with per-port adapter registries, `/api/health`, static CSP on `/app/**`.
- `apps/agent`: `askcalls` CLI with every command registered.
- `docker/docker-compose.yml` (Postgres + pgvector, MinIO, web), `docker/Dockerfile`.
- CI: `.github/actions/setup`, `.github/actions/checks`, `preview.yml` (checks only until M1).

## M1: Auth, Postgres, pipelines

- Auth.js v5 with open sign-up: Google (with One Tap on `/` and `/login`), GitHub and email magic links; JWT sessions over the `UserRepository` port.
- `packages/adapters/db-postgres`: every repository port and `SearchIndex` on Drizzle (Prisma was dropped for PGlite support, see its README), one schema and SQL for `pg` and PGlite, row-level security through the `askcalls_app` role and a transaction-local `app.user_id`.
- Per-PR Neon branches and Vercel previews (`preview.yml`), `deploy.yml` (dev on push, production on merge to master after the full suite), `ci.yml` (integration and E2E on demand), `docs/deployment.md`.
- Cross-user authorization tests on every API route.

## M2: Crypto and keys

- `packages/crypto`: key hierarchy, AEAD envelope with bound AAD, passkey (PRF), recovery-code, passphrase (Argon2id) and device wrapping, blind-index tokens, ECIES, device signatures, segmented recording encryption, with test vectors generated independently with node:crypto.
- Onboarding with a passkey and a confirmed recovery code, the unlock gate, auto-lock that wipes keys and decrypted state.
- The leak test wired into `bun run test`.

## M3: Formats, indexing, first upload

- `packages/transcript-formats` (TXT, SRT, VTT, Whisper, Deepgram, AssemblyAI and generic JSON) and `packages/indexing` (Hebrew and English normalization and prefixes, tokens, redaction, chunking, intents, rules).
- Single transcript upload, the call list and the call view with signature verification.

## M4: Search

- Encrypted vocabulary with fuzzy and Hebrew-prefix expansion, contact, tag, date and semantic filters, answered by the Postgres `SearchIndex` in one SQL query; the 10,000-call performance test.

## M5: Audio and recordings

- `AudioCodec` (WebCodecs with an ffmpeg.wasm fallback; ffmpeg in the agent), audio fingerprint dedupe, `POST /api/transcribe` with ElevenLabs, OpenAI, Deepgram, Soniox, OpenAI-compatible and mock providers, recording backups through `BlobStore` (S3-compatible and fs) with click-to-seek playback.

## M6: Bulk upload

- Pairing by file name, `manifest.csv`, iPhone and Samsung file names, ZIPs, a resumable queue with pause and retry.

## M7: Organise and providers

- Stars, tags, intents, auto-tag rules, synonyms, notes, Open in WhatsApp, call back, "ask about this call" with streamed answers, and Settings → Providers with managed and own-key transcription and LLM (own-key requests go straight from the device to the provider).

## M8: Settings

- Device linking with a verified fingerprint, personal access tokens, retention with its daily job, the audit log, export decrypted on the device, account deletion.

## M9: MCP

- The `askcalls` agent: `login`, `link`, `mcp` (stdio server with search, read, ingest, star and tag tools) and `ingest`; the remote MCP endpoint with `inbox_upload`, processed on the next unlock.

## M9b: Instance configuration and offline mode

- `ConfigService` (env locks → `config.json` → defaults), `/admin/instance`, the first-run setup wizard, local accounts, own-bucket recordings, OpenAI-compatible local transcription and LLM, `OFFLINE_MODE` with the offline Compose file.

## M9c: Local mode

Not landed yet: `askcalls local`, `askcalls backup` and `askcalls restore` are registered but report that they are not built. The PGlite driver and its contract run are in place (M1).

## M10: Marketing, i18n, PWA, telemetry, release

- Marketing site, English and Hebrew with right-to-left layouts and a persistent locale, the PWA shell.
- Telemetry adapters `telemetry-otel`, `-sentry`, `-posthog` and `-umami`, fanned out from `TELEMETRY`, all behind one allow-list scrubber in `@askcalls/domain/telemetry`; a contract suite plants transcript words in every field and fails if any reaches a request. Browser product events and error reports go through `POST /api/telemetry/events` and `/errors`, dropped unless the account opted in.
- Fast checks gained the dependency audit (critical advisories in runtime dependencies), the leak test on PGlite with fs storage (every table and every blob file), the CSP check of every app page through the real middleware, and the bundle-size budget on a production build. App pages load 250 to 357 kB of gzipped JS; the pages over 250 kB are held at their current size by `scripts/checks/bundle-budget.json` until they are brought under it.
- Reproducible client builds (fixed build id, stable chunk order, no server actions in browser code), verified by building twice; `release.yml` publishes client asset hashes, the npm agent (bundled for Node 20+ and Bun), a multi-arch image on GHCR and per-architecture offline bundles; `bun run release:dry-run`. `codeql.yml` and grouped weekly Dependabot updates.
- `SECURITY.md`, `CONTRIBUTING.md`, `docs/architecture.md`, `docs/threat-model.md`, `docs/adapters.md`, `docs/reproducible-builds.md`.
