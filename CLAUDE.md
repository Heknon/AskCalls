# AskCalls

End-to-end encrypted call transcripts. The server indexes and returns calls but can never read them. Read `README.md` for the product and `docs/architecture.md` for the design.

## Commands

```sh
bun install
bun run dev                # web app on :3000 with in-memory database and mock providers (.env.development)
bun run check              # lint + typecheck + boundaries + unit/contract tests: run before every push
bun run test               # unit and contract tests (Vitest under Bun)
bun run test:integration   # *.int.test.ts against real Postgres and MinIO (Docker)
bun run test:e2e           # Playwright (apps/web/e2e)
bun run format             # Biome autofix
bun run --cwd apps/web build && bun run budget   # bundle-size ceilings CI enforces: run before every push that changes web or client code
```

The bundle budget (`scripts/checks/bundle-budget.json`) caps each page's first-load JS, and many pages sit within bytes of their ceiling. Run it locally before pushing, not after CI fails. Over a ceiling: move code a page doesn't need at first paint behind `import()`, or trim it; raise a ceiling only as a reviewed edit called out in the PR.

## Layout and ownership

- `packages/domain`: entities, port interfaces, use cases, contract suites. Imports nothing but zod. Never imports Prisma, the AWS SDK, Next.js, Auth.js or any vendor SDK.
- `packages/{crypto,indexing,transcript-formats,client-core,api-contract}`: isomorphic. They run unchanged in the browser and Node 20+: `globalThis.crypto`, no `node:` imports, no Bun-only APIs.
- `packages/adapters/<name>`: one adapter package per implementation. Each runs its port's contract suite from `@askcalls/domain/contracts/<port>`. Adapters never import other adapters.
- `apps/web/src/server/container.ts`: the composition root. Adapters are selected in `apps/web/src/server/adapters/<port>.ts`; add a `case` there when you add an adapter. Only `ConfigService` reads env vars or `config.json`.
- `bun run boundaries` (dependency-cruiser) enforces these rules in CI.

## Conventions

- Packages export TypeScript source (`"exports": { ".": "./src/index.ts", "./*": "./src/*.ts" }`); no build step. Import other packages by subpath (`@askcalls/api-contract/routes/calls`) rather than adding to someone else's barrel file.
- API routes: one file per area in `packages/api-contract/src/routes/`, declared with `defineRoute`. That file is the single source of truth for the handler and the typed client. Bytes travel as base64, tokens as decimal strings (`wire.ts`).
- Tests sit next to the code: `*.test.ts` (unit, contract with in-memory or PGlite), `*.int.test.ts` (needs Docker services).
- Errors are `DomainError(code, message)`. Messages and logs are content-free: ids, counts and codes only.
- No `console.log` outside the agent CLI and tests (Biome enforces it).
- UI strings live in message files (next-intl); no hard-coded copy in components. Use logical CSS properties (`ms-`, `pe-`, `start-`) so RTL works. Transcript text uses `dir="auto"`.
- Design system and screen specs: `docs/design/`.
- Deployment (GitHub Actions → Vercel, Neon, AWS S3 + CloudFront via CDK in `infra/`), pipelines and one-time setup: `docs/deployment.md`.

## UI components

`docs/design/design-language.md` is the source of truth for the UI. Read it before building any screen.

- Three layers: primitives (shadcn/ui in `packages/ui`, styled only through design tokens) → product components (the catalog in the design language doc, also in `packages/ui`) → screens in `apps/web`. Screens compose product components; they never restyle primitives or copy markup.
- Components are named by meaning (`CallRow`, `LockedValue`, `DataFlowNote`, `TagChip`), not by look (`GrayBox`, `Card2`).
- One component per meaning. Before writing a component, search the catalog and `packages/ui`. Need a variation? Add a variant with a meaning (`TagChip variant="star"`), don't copy. A new component is added to the catalog in the same PR.

## Copy: no slop

Every word on screen must earn its place. If removing it loses nothing, remove it.

- No captions that restate what's visible, no reassurance lines, no taglines inside the app. A page title needs no subtitle unless the subtitle carries information the user acts on.
- Don't advertise encryption in the app. Mention it only where it changes what the user does or decides: unlocking, the recovery code, consent before data goes to a provider, the inbox in-transit notice, and the data-flow line on provider cards. Locked or decrypting state is shown with the lock icon and a skeleton, not a sentence.
- Empty states: one short line saying what's missing and the action that fixes it.
- No filler words: seamless, secure, powerful, effortless, simply, just, easily, robust, magic. No exclamation marks, no emojis.
- Labels are nouns or verbs (`Upload`, `Delete call`), not sentences. Errors say what happened and what to do next, in one line.
- The marketing site explains the privacy model once, with proof (the diagram, the source, the leak test), not on every section.
- The same rule applies to code: no comments restating the code, no placeholder text, no TODO stubs.

## Security rules (non-negotiable)

1. Plaintext never persists server-side: no transcript text, words, names, numbers, tag names, notes or recordings stored unencrypted, logged, cached or sent to telemetry.
2. Plaintext reaches third parties only per request with consent, in transit, through three routes: audio via `POST /api/transcribe`, one call via `POST /api/ask`, and transcripts of the calls the user's translation rules cover via `POST /api/translate` (consent is the rules themselves, set in Settings → Providers and stated on the upload screen; no rules, nothing sent). Those routes stream, never write to disk or blobs, never log bodies. Search queries never leave the device.
3. Keys never leave a device unwrapped. The server stores wrapped keys and public keys only.
4. No third-party scripts on `/app/**`. Strict CSP: `script-src 'self' 'wasm-unsafe-eval'`. Next.js needs inline bootstrap scripts, so app routes use a per-request nonce set in middleware, never `'unsafe-inline'`.
5. Service worker caches the static shell only. Decrypted data lives in memory and is wiped on lock.
6. Transcripts are untrusted data: wrap them with `wrapTranscript()` and `ASK_SYSTEM_PROMPT` from the domain.
7. The leak test must pass: seeded words and numbers never appear in a dump of the database or blob bucket.

Every API route requires a session or a scoped token, is rate-limited, writes audit events for call reads and writes, and returns `Cache-Control: no-store`. Every query on a user-owned table filters by `userId`.

## Git

- Never push to `master`. Every change goes through a pull request.
- Branch names: `feature/<what>` for new capability, `bugfix/<what>` for fixes, `refactor/<what>` for restructuring with no behavior change, `docs/<what>` for docs only. Lower-case, hyphenated: `feature/postgres-adapters`, `bugfix/remote-mcp-path`.
- One bucket of work per PR. The PR description says what changed, how it was tested, and anything reviewers must check.
- Commit messages are short and imperative. Don't edit migrations that already reached `dev`; add new ones.
