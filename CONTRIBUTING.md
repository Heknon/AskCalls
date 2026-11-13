# Contributing

Thanks for helping. AskCalls is end-to-end encrypted call storage: the server indexes and returns calls but can never read them. Every change has to keep that true, so please read [docs/architecture.md](docs/architecture.md) and the [threat model](docs/threat-model.md) before your first pull request. Security reports go through [SECURITY.md](SECURITY.md), not issues.

## Set up

You need [Bun](https://bun.sh) (the version in `package.json` → `packageManager`) and Docker for the integration tests.

```sh
bun install
bun run dev                # web app on :3000, in-memory database and mock providers
```

## Before you push

```sh
bun run check              # lint, typecheck, boundaries, unit and contract tests (leak, CSP, telemetry), infra/ tests and synth
bun run check:bundle       # production build and the bundle-size budget
bun run test:integration   # API routes against real Postgres and MinIO (Docker)
bun run test:e2e           # Playwright
bun run format             # Biome autofix
```

Pull requests run the fast checks (`bun run check` plus the build, dependency audit and bundle budget). Integration and E2E tests run before every production release and when a maintainer adds the `full-tests` label, so run them locally when you touch what they cover.

## Rules the checks enforce

- **Boundaries** (`bun run boundaries`): `packages/domain` imports nothing but zod; `packages/{crypto,indexing,transcript-formats,client-core,api-contract}` run unchanged in browsers and Node (no `node:` imports, no Bun-only APIs); adapters never import each other; nothing under `packages/` imports `apps/`.
- **The leak test**: seeded words and phone numbers must never appear in a dump of the database or blob storage, on the in-memory stores and on PGlite with fs storage.
- **The CSP check**: every app page allows scripts from its own origin and its nonce only.
- **The telemetry contract**: no seeded word reaches any telemetry backend.
- **The bundle budget**: app pages load at most 250 kB of gzipped JS before lazy chunks; pages already over it may not grow (`scripts/checks/bundle-budget.json`).
- **Reproducible builds**: browser code never calls server actions ([docs/reproducible-builds.md](docs/reproducible-builds.md)).

## Conventions

- Tests sit next to the code: `*.test.ts` for unit and contract tests (in-memory or PGlite), `*.int.test.ts` for tests that need Docker services.
- API routes are declared once in `packages/api-contract/src/routes/<area>.ts` with `defineRoute`; that file drives both the handler and the typed client. Every route needs a session or a scoped token, is rate-limited, audits call reads and writes, returns `Cache-Control: no-store`, and filters every user-owned query by `userId`.
- Errors are `DomainError(code, message)`; messages and logs carry ids, counts and codes only, never content.
- UI strings live in the message files (next-intl); use logical CSS properties (`ms-`, `pe-`, `start-`) so right-to-left works, and `dir="auto"` on transcript text.
- New external services go behind a port: see [docs/adapters.md](docs/adapters.md).
- Never edit a migration that has reached `dev`; add a new one, backward compatible with the version still serving ([docs/deployment.md](docs/deployment.md)).

## Commits and pull requests

Short, imperative commit messages ("Add the Umami telemetry adapter"). Keep a pull request to one change; say what it changes for users and how you tested it. By contributing you agree your work is released under the [MIT license](LICENSE).
