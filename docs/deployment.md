# Deployment

The hosted service (askcalls.com) deploys from GitHub Actions to Vercel, with Neon Postgres and
Cloudflare R2. Vercel's git integration is off (`apps/web/vercel.json` →
`git.deploymentEnabled: false`) so a deploy can never race ahead of its migrations. Self-hosting
is `docker compose up` (`docker/docker-compose.yml`) and needs none of this.

```
feature/* ──PR──▶ Preview     Neon branch preview/pr-<n> (from dev) → migrate → Vercel preview (mock providers,
    │                         blobs under askcalls-dev/preview/pr-<n>/) → PR comment → fast checks
    │                         (closing the PR deletes the Neon branch and the blob prefix)
    ▼ merge
   dev   ──push──▶ dev        fast checks → migrate the dev branch → Vercel (DEV_DOMAIN follows the dev branch)
    │
    ▼ merge (PR dev → master)
 master  ─manual─▶ production Actions → Deploy → Run workflow on master → full tests (fast checks + integration ∥ E2E)
                              → migrate main → Vercel --prod
```

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` (Full tests) | before production (called by `deploy.yml`); the `full-tests` label on a pull request; Run workflow by hand | two parallel jobs: fast checks + integration tests (pgvector Postgres service, MinIO), and Playwright E2E on Chromium |
| `preview.yml` | pull request opened / synchronized / reopened / closed (not for docs-only changes) | one job: per-PR database branch + migrations + preview deploy + PR comment, then the fast checks; cleanup on close |
| `deploy.yml` | push to `dev`; production only via Run workflow on `master` (other branches are skipped) | production first waits for `ci.yml`; then one job: fast checks (dev only; production ran them in `ci.yml`) → migrations → Vercel |

Shared pieces: `.github/actions/setup` (Bun at the `packageManager` version, cached store keyed
on `bun.lock`, frozen install) and `.github/actions/checks` (lint, typecheck, boundaries, unit
and contract tests on PGlite and in-memory adapters, including the leak test). The Vercel and
Neon CLIs are pinned root devDependencies, so the workflows run `bunx vercel` and
`bunx neonctl` at the versions in `bun.lock`.

## Cost rules

- **Fewest jobs.** GitHub bills every job rounded up to a whole minute, plus a runner boot and
  an install, so work that takes under a minute goes inside an existing job. The fast checks
  run as a composite action inside the job that deploys, never in a job of their own.
- **Expensive tests on demand.** Integration and E2E tests don't run on every push: run them
  locally before pushing (`bun run test:integration`, `bun run test:e2e`; `CLAUDE.md`). CI runs
  them once per production release, before it deploys, and on a pull request when you add the
  `full-tests` label (remove and re-add it to run again).
- **No provider spend on pull requests.** Previews deploy with `TRANSCRIPTION_PROVIDER=mock` and
  `LLM_PROVIDER=mock`. Add the `real-providers` label to switch a PR's preview to the non-prod
  keys; it takes effect on the next push (or close and reopen).
- `concurrency` with `cancel-in-progress` on previews and the full suite, so a new push cancels
  the old run; never on deploys.
- `runs-on: ubuntu-24.04` only for E2E (Playwright's browser dependencies); `ubuntu-latest`
  elsewhere. Playwright browsers are cached (headless shell only), and the report is uploaded
  only on failure, kept 7 days.
- **Forks and unconfigured repos cost nothing extra.** A pull request from a fork gets no
  secrets: `preview.yml` skips the database, deploy and comment steps and still runs the
  checks. The same happens while `NEON_API_KEY` or `VERCEL_TOKEN` is unset (before the one-time
  setup below), and `deploy.yml` skips migrate and deploy on `dev` with a notice. Once the
  secrets are in, a missing repository variable fails the run with its name.

## Rules for changes

- **Migrations must be backward compatible with the version still serving.** They run before
  the new code is live, and a failed app deploy leaves the database migrated. Add columns as
  nullable or with defaults; rename or drop in two releases (stop using it, then drop it). The
  runner applies all pending migrations in one transaction, so no `CREATE INDEX CONCURRENTLY`
  (`packages/adapters/db-postgres/README.md`).
- **Never edit a migration that has reached `dev`.** The runner refuses checksum changes. Add a
  new migration instead.
- A pull request's preview database is created once and migrated on every push. If a PR rewrites
  its own migration, the next migrate fails and the workflow resets `preview/pr-<n>` to its
  parent once and retries. If that still fails, delete the branch in Neon and push again.

## Rollback

- **App:** Vercel dashboard → Deployments → Instant Rollback (or `vercel rollback`). For dev,
  revert the commit on `dev`.
- **Database:** migrations are not rolled back automatically. Ship a forward-fixing migration,
  or use Neon's point-in-time restore (to a new branch first, to inspect).

## Cron

Vercel Cron (`apps/web/vercel.json`) calls `/api/cron/retention` daily at 03:00 UTC with
`Authorization: Bearer <CRON_SECRET>`; it runs the retention purge (calls past each user's
retention period). Without `CRON_SECRET` the route answers 503 whenever `NODE_ENV` is
`production` (every Vercel deployment), so a deployment missing the secret fails closed rather
than open. Vercel runs crons only for the production deployment, so dev and previews need no
secret. Off Vercel, `SCHEDULER=in-process` runs the same job inside the server.

## Region

Everything runs in Frankfurt: Neon (`eu-central-1`), the R2 buckets (EU jurisdiction), and
Vercel Functions (`"regions": ["fra1"]` in `apps/web/vercel.json`; also set the project's
Function Region to Frankfurt, see Vercel below). Vercel's default, Washington D.C., would put an
Atlantic round trip on every query.

## One-time setup

### 1. Neon

1. Create a project in `aws-eu-central-1` (Frankfurt). Keep the default database (`neondb`) and
   owner role (`neondb_owner`): the workflows connect as the owner, which has the `CREATEROLE`
   that migration `0001` needs to create `askcalls_app`.
2. Create the `dev` branch from `main` (Console → Branches, or
   `bunx neonctl branches create --name dev --parent main`). **Seed it with synthetic data
   only, never real calls**: previews branch from it. (Ciphertext is unreadable without user
   keys, but previews are less protected than production and don't need real data.)
3. Create an API key (Account → API keys) for the preview workflow.
4. If the Neon–Vercel integration is installed, turn off its automatic preview branches:
   `preview.yml` manages them.
5. Note the project id (Settings → General) and the **direct** (unpooled) connection strings of
   `main` and `dev` for GitHub, and the **pooled** ones for Vercel.

### 2. Cloudflare R2

1. Create two buckets with location **EU jurisdiction**: `askcalls-prod` and `askcalls-dev`. Dev
   uses `askcalls-dev` under `dev/`; each preview under `preview/pr-<n>/` (`S3_KEY_PREFIX`).
2. CORS (bucket → Settings → CORS policy). Browsers PUT and GET encrypted recordings straight to
   the bucket. This is `corsJson(origins)` from `@askcalls/adapter-blob-s3`:

   `askcalls-prod`:

   ```json
   [
     {
       "AllowedOrigins": ["https://askcalls.com"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["ETag", "Content-Length"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   `askcalls-dev` (`DEV_DOMAIN`, the preview URLs, local development):

   ```json
   [
     {
       "AllowedOrigins": [
         "https://<DEV_DOMAIN>",
         "https://askcalls-*-<vercel-team-slug>.vercel.app",
         "http://localhost:3000"
       ],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "ExposeHeaders": ["ETag", "Content-Length"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Preview URLs are random, hence the wildcard. Cloudflare's docs only show exact origins, so
   check it once a preview exists: a preflight must echo the preview's origin back.

   ```sh
   curl -si -X OPTIONS "https://<account-id>.eu.r2.cloudflarestorage.com/askcalls-dev/probe" \
     -H "Origin: https://<a-preview-url>" -H "Access-Control-Request-Method: PUT" \
     -H "Access-Control-Request-Headers: content-type" | grep -i access-control-allow-origin
   ```

   If R2 doesn't match the pattern, recordings fail in previews; everything else works.
   (`checkCorsByPreflight` in `@askcalls/adapter-blob-s3` runs the same check from code.)
3. API tokens (R2 → Manage API tokens), **one per bucket**, "Object Read & Write" scoped to that
   bucket only:
   - `askcalls-prod` → Vercel Production only.
   - `askcalls-dev` (the non-prod key, which can't touch production) → Vercel Preview, and the
     GitHub `preview` environment for blob cleanup.
4. The S3 endpoint is `https://<account-id>.eu.r2.cloudflarestorage.com` (the `.eu.` host for
   EU-jurisdiction buckets); region `auto`.

### 3. Vercel

1. Create the project and import the GitHub repository (branch domains need the Git
   connection; `git.deploymentEnabled: false` keeps Vercel from building on push). Project
   settings:
   - **Root Directory:** `apps/web` (with "Include files outside the root directory" on, the
     default: the app imports the workspace packages).
   - **Framework, install and build commands:** set in `apps/web/vercel.json` (`nextjs`,
     `bun install --frozen-lockfile`, `bun run build`), so leave the dashboard defaults.
   - **Node.js version:** 22.x. **Function Region:** Frankfurt (`fra1`).
   - The workflows run `vercel build` from the repository root; the CLI reads the Root
     Directory from the pulled project settings and writes `.vercel/output` at the root.
2. Create a token (Account Settings → Tokens). Note the org and project ids (`vercel link`, then
   `.vercel/project.json`).
3. Add `DEV_DOMAIN` (for example `dev.askcalls.com`) to the project's domains and **assign it to
   the `dev` branch**: each dev deployment (built from a dev checkout, so it carries the branch)
   takes it over. Add `askcalls.com` as the production domain.
4. Deployment Protection: leave Vercel Authentication on for previews if only the team reviews
   them; the dev domain and production must be public for sign-in to work.
5. Environment variables (Settings → Environment Variables). "Preview" is the Preview scope for
   all branches; "dev" is the Preview scope narrowed to branch `dev`, which overrides it:

   | Variable | Production | Preview (all) | Preview, branch `dev` |
   |---|---|---|---|
   | `APP_URL` | `https://askcalls.com` | — (only the `fs` blob driver reads it) | `https://<DEV_DOMAIN>` |
   | `ASKCALLS_HOSTED` | `true` | — | — |
   | `AUTH_SECRET` | prod secret | non-prod secret | **same** non-prod secret |
   | `AUTH_PROVIDERS` | `google` (plus `github` if used) | same as dev | `google` (plus `github`) |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | prod OAuth client | non-prod OAuth client | non-prod OAuth client |
   | `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | prod OAuth app (if used) | non-prod OAuth app | non-prod OAuth app |
   | `AUTH_REDIRECT_PROXY_URL` | — (unset) | `https://<DEV_DOMAIN>/api/auth` | `https://<DEV_DOMAIN>/api/auth` |
   | `DB_DRIVER` | `postgres` | — (set per deploy) | `postgres` |
   | `DATABASE_URL` | `main`, pooled | — (set per deploy) | `dev` branch, pooled |
   | `BLOB_DRIVER` | `s3` | `s3` | `s3` |
   | `S3_ENDPOINT` | `https://<account-id>.eu.r2.cloudflarestorage.com` | same | same |
   | `S3_REGION` | `auto` | `auto` | `auto` |
   | `S3_BUCKET` | `askcalls-prod` | `askcalls-dev` | `askcalls-dev` |
   | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | prod bucket token | dev bucket token | dev bucket token |
   | `S3_KEY_PREFIX` | — (unset) | — (set per deploy: `preview/pr-<n>/`) | `dev/` |
   | `TRANSCRIPTION_PROVIDER` | `elevenlabs` | `elevenlabs` (overridden to `mock` per deploy without `real-providers`) | `elevenlabs` |
   | `ELEVENLABS_API_KEY` | prod key | non-prod key | non-prod key |
   | `LLM_PROVIDER` | `anthropic` | `anthropic` (overridden to `mock` like above) | `anthropic` |
   | `LLM_MODEL` | the production model | same | same |
   | `ANTHROPIC_API_KEY` | prod key | non-prod key | non-prod key |
   | `CRON_SECRET` | required (`openssl rand -base64 32`) | — | — |
   | `TELEMETRY` | `none`, or the backends in use (content-free) | `none` | `none` |

   - `ASKCALLS_HOSTED=true` only in production: it locks the instance config, hides the offline
     toggle, and keeps the Auth.js test provider off.
   - Set `DB_DRIVER` and `BLOB_DRIVER` explicitly everywhere; the defaults (`postgres`, `s3`)
     match, but a set variable also locks the setting in `/admin/instance`.
   - `SCHEDULER` can stay unset: on Vercel it defaults to `vercel-cron`.
   - Never set `AUTH_TEST_PROVIDER` on Vercel; the test provider is for E2E only.

### 4. GitHub

1. Create the `dev` branch from `master` (`git push origin master:dev`), and make it the base
   for feature pull requests.
2. Repository variables (Settings → Secrets and variables → Actions → Variables):
   `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `NEON_PROJECT_ID`, `NEON_PREVIEW_PARENT_BRANCH` (`dev`),
   `DEV_DOMAIN` (host only, e.g. `dev.askcalls.com`).
3. Environments (Settings → Environments), each with secrets:

   | Environment | Deployment branches | Secrets |
   |---|---|---|
   | `preview` | any | `NEON_API_KEY`, `VERCEL_TOKEN`, `S3_ENDPOINT`, `S3_BUCKET` (`askcalls-dev`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (the dev bucket token, for cleanup on close) |
   | `dev` | `dev` only | `DATABASE_URL` (`dev` branch, **direct**), `VERCEL_TOKEN` |
   | `production` | `master` only | `DATABASE_URL` (`main`, **direct**), `VERCEL_TOKEN` |

   `DATABASE_URL` here only runs migrations; the app's pooled URL is in Vercel.
4. Labels: `full-tests` (runs `ci.yml` on the PR) and `real-providers` (previews use the
   non-prod provider keys).
5. Production approval: merging into `master` deploys nothing; production deploys when someone
   runs **Actions → Deploy → Run workflow** on `master` (required reviewers and branch protection
   need a paid plan for private repos; with them, add reviewers to `production`).

## Authentication (Auth.js v5)

Google rejects wildcard redirect URIs, so random preview URLs can't receive Google's callback.
The dev deployment acts as a **redirect proxy**: previews send Google (and GitHub) sign-in
through `DEV_DOMAIN`, which completes it and returns the user to the preview.

| | Production | Dev (`DEV_DOMAIN`, Preview scope, branch `dev`) | Previews (Preview scope) |
|---|---|---|---|
| `AUTH_SECRET` | prod secret | non-prod secret | **same** non-prod secret |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | prod OAuth client | non-prod OAuth client | non-prod OAuth client |
| `AUTH_REDIRECT_PROXY_URL` | — (unset) | `https://<DEV_DOMAIN>/api/auth` | `https://<DEV_DOMAIN>/api/auth` |
| `AUTH_URL` | — (unset; `trustHost` uses the request host) | — | — (**must be unset**) |

- Dev sets the proxy URL to **itself**; that is how it knows to act as the proxy.
- Previews must not set `AUTH_URL`: it would override every preview's own URL.
- Production never shares its secret or OAuth client with dev or previews, so no preview can
  mint a session production accepts.
- Google One Tap needs every page origin registered with Google, which random previews can't
  do; on previews the sign-in page falls back to the Google button.

Google Cloud (one project, APIs & Services → Credentials → OAuth client IDs, Web application):

- **Prod client:** redirect URI `https://askcalls.com/api/auth/callback/google`, JavaScript
  origin `https://askcalls.com`.
- **Non-prod client:** redirect URIs `https://<DEV_DOMAIN>/api/auth/callback/google` and
  `http://localhost:3000/api/auth/callback/google`; origins `https://<DEV_DOMAIN>` and
  `http://localhost:3000`.

GitHub OAuth apps allow one callback URL each: prod `https://askcalls.com/api/auth/callback/github`,
non-prod `https://<DEV_DOMAIN>/api/auth/callback/github` (local development uses a third app or
the Google client).
