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
