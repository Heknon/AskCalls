# Deployment

The hosted service (askcalls.com) deploys from GitHub Actions to Vercel, with Neon Postgres and
AWS S3 (recordings) and CloudFront (the embedding model), both defined as a CDK app in
[`infra/`](../infra). Vercel's git integration is off (`apps/web/vercel.json` →
`git.deploymentEnabled: false`) so a deploy can never race ahead of its migrations. Self-hosting
is `docker compose up` (`docker/docker-compose.yml`) and needs none of this.

```
feature/* ──PR──▶ Preview     Neon branch preview/pr-<n> (from dev) → migrate → Vercel preview (mock providers,
    │                         blobs under askcalls-dev/preview/pr-<n>/) → PR comment → fast checks
    │                         (closing the PR deletes the Neon branch and the blob prefix)
    ▼ merge
   dev   ──push──▶ dev        fast checks → CDK AskCallsStorage-dev → publish the model (if new) → migrate the dev
    │                         branch → Vercel (DEV_DOMAIN follows the dev branch)
    ▼ merge (PR dev → master)
 master  ──push──▶ production full tests (fast checks + integration ∥ E2E)
                              → CDK AskCallsStorage-prod + AskCallsModels → publish the model (if new) → migrate main
                              → Vercel --prod
 v*.*.*  ──tag───▶ release    fast checks → client asset hashes → npm (agent) → Docker image (GHCR, amd64 + arm64)
                              → offline bundles → GitHub release
```

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` (Full tests) | before production (called by `deploy.yml`); the `full-tests` label on a pull request; Run workflow by hand | two parallel jobs: fast checks + integration tests (pgvector Postgres service, MinIO), and Playwright E2E on Chromium |
| `preview.yml` | pull request opened / synchronized / reopened / closed (not for docs-only changes) | one job: per-PR database branch + migrations + preview deploy + PR comment, then the fast checks; cleanup on close |
| `deploy.yml` | push to `dev` or `master` (docs-only changes skip it); Run workflow to re-deploy (other branches are skipped) | production first waits for `ci.yml`; then one job: fast checks (dev only; production ran them in `ci.yml`) → `cdk deploy` (`AskCallsStorage-<env>`, plus `AskCallsModels` on production) through the OIDC deploy role → `models:publish` (a few HEAD requests when the pinned build is already there) → migrations → Vercel |
| `release.yml` | a `v<major>.<minor>.<patch>` tag | one job: build and fast checks, SHA-256 of every client JS asset, the `askcalls` npm package, the multi-arch image to `ghcr.io/<owner>/askcalls`, offline bundles, and a GitHub release whose notes carry every checksum ([reproducible-builds.md](reproducible-builds.md)) |
| `codeql.yml` | weekly, pushes to `master`, by hand | CodeQL (JavaScript and TypeScript, security-extended) |

`AskCallsGithubDeploy` (the OIDC roles the workflows assume) is the one stack no workflow
deploys; it is deployed by hand once (AWS setup below).

Dependabot (`.github/dependabot.yml`) opens one grouped pull request per ecosystem each week:
Bun packages, GitHub Actions, the Dockerfile and the Compose files.

Shared pieces: `.github/actions/setup` (Bun at the `packageManager` version, cached store keyed
on `bun.lock` and `infra/bun.lock`, frozen installs of the app and of `infra/`) and
`.github/actions/checks` (lint, typecheck, boundaries, unit and contract tests on PGlite, fs and
in-memory adapters, including the leak test on both storages, the telemetry scrubber contract
and the CSP check; the `infra/` typecheck, CDK assertion tests and `cdk synth` of every stack,
with no AWS credentials; then the dependency audit, a production build and the bundle-size
budget). The Vercel and Neon CLIs are pinned root devDependencies, so the workflows run
`bunx vercel` and `bunx neonctl` at the versions in `bun.lock`; the CDK CLI is pinned in
`infra/package.json`.

`infra/` is its own package with its own `bun.lock`, not a workspace: `aws-cdk-lib` (about
170 MB with the CLI) stays out of the app's install on Vercel and in Docker. `bun run check`
installs it (`bun run check:infra`) and runs its checks.

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

## AWS costs

Rough monthly numbers for `eu-central-1`; check the AWS pricing pages before relying on them.

- **S3 storage:** about $0.0245 per GB-month (S3 Standard, Frankfurt) for the encrypted
  recordings, plus requests ($0.0054 per 1,000 PUTs, $0.00043 per 1,000 GETs). The free tier
  covers 5 GB for the first year only. Dev's preview objects expire after 14 days.
- **Egress for recording downloads:** browsers download recordings straight from the bucket with
  presigned URLs, which is internet data transfer out. The first 100 GB per month (across the
  account) are free, then about $0.09 per GB. Uploads (data in) are free.
- **Model downloads:** CloudFront's always-free tier is 1 TB of transfer out and 10 million
  requests per month. The model is about 25 MB gzip and each browser keeps it in Cache Storage
  after the first load, so that is roughly 40,000 first loads a month for free. CloudFront to
  S3 transfer is free; only cache misses (one per edge per file, once per build) reach S3.
- **IAM, OIDC, CloudFormation, the CDK bootstrap:** free, apart from the bootstrap's asset
  bucket (a few KB).

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

Everything runs in Frankfurt: Neon (`eu-central-1`), the S3 buckets (`askcalls:region` in
`infra/cdk.json`, `eu-central-1`), and Vercel Functions (`"regions": ["fra1"]` in `apps/web/vercel.json`; also set the project's
Function Region to Frankfurt, see Vercel below). Vercel's default, Washington D.C., would put an
Atlantic round trip on every query. The model CDN is CloudFront (price class 100: North
America, Europe and Israel); its bucket is in Frankfurt too.

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

### 2. AWS (once, with admin credentials)

The CDK app in [`infra/`](../infra) owns everything on AWS. Context in `infra/cdk.json`:

| Key | Value |
|---|---|
| `askcalls:region` | `eu-central-1` (the app's `S3_REGION`) |
| `askcalls:githubRepo` | `Heknon/AskCalls` (the only repository the OIDC roles trust) |
| `askcalls:githubSubjectPrefix` | the OIDC `sub` before `:environment:`. Default `repo:<githubRepo>`; a repository on immutable subjects sends `repo:<owner>@<owner-id>/<name>@<repo-id>` (`sub_claim_prefix` in `gh api repos/<owner>/<name>/actions/oidc/customization/sub`) |
| `askcalls:buckets` | `{ "prod": "askcalls-prod", "dev": "askcalls-dev" }` |
| `askcalls:modelsBucket` | `askcalls-models` |
| `askcalls:appOrigins` | per environment, the origins allowed by bucket CORS: prod `https://askcalls.com`; dev `https://<DEV_DOMAIN>` (`https://dev.askcalls.com` in the file: change it if `DEV_DOMAIN` differs), `https://askcalls-*.vercel.app` (previews), `http://localhost:3000` |
| `askcalls:existingOidcProviderArn` | optional, `-c` on the command line: reuse the account's GitHub OIDC provider |
| `askcalls:modelsDomain`, `askcalls:modelsCertificateArn` | optional pair: custom domain for the model CDN (step 6) |

| Stack | Deployed by | Owns |
|---|---|---|
| `AskCallsGithubDeploy` | hand, once | GitHub OIDC provider; role `askcalls-github-deploy` (trusts only this repo's `dev` and `production` environments; may assume the CDK bootstrap roles, publish to `askcalls-models/e5-pruned/*`, read `AskCallsModels`' outputs); role `askcalls-github-preview-cleanup` (trusts only the `preview` environment; may list and delete `askcalls-dev/preview/*`) |
| `AskCallsStorage-dev` | `deploy.yml` on dev | bucket `askcalls-dev` (dev under `dev/`, each preview under `preview/pr-<n>/`); IAM user `askcalls-app-dev` |
| `AskCallsStorage-prod` | `deploy.yml` on production | bucket `askcalls-prod`; IAM user `askcalls-app-prod` |
| `AskCallsModels` | `deploy.yml` on production | bucket `askcalls-models` behind a CloudFront distribution |

Recording buckets: public access blocked, ACLs disabled, SSE-S3, a bucket policy denying
anything but TLS 1.2+, CORS exactly `corsJson(origins)` from `@askcalls/adapter-blob-s3` (GET,
PUT, HEAD; the `content-type` header; `ETag` and `Content-Length` exposed), incomplete multipart
uploads aborted after a day, and in dev `preview/` objects expire after 14 days (a safety net
behind the PR-close cleanup). Versioning is off on purpose: the buckets hold ciphertext only, a
segment is never rewritten, and a deleted recording (retention purge, call or account deletion)
must be gone rather than kept as a noncurrent version. SSE-KMS would add per-request cost and
nothing else, since the objects are already encrypted with keys AWS never sees. Every bucket is
`RETAIN`: deleting a stack never deletes data. Each IAM user may only `GetObject`, `PutObject`,
`DeleteObject` in its own bucket, plus `ListBucket` and `GetBucketCORS` on it.

1. Check the context above (`askcalls:appOrigins.dev` must hold the real `DEV_DOMAIN`). S3 bucket
   names are global: if one is taken, change it in `askcalls:buckets` and in the Vercel table
   below.
2. Bootstrap CDK and deploy the GitHub roles:

   ```sh
   cd infra && bun install
   bunx cdk bootstrap aws://<account>/eu-central-1
   bunx cdk deploy AskCallsGithubDeploy
   # account already has a GitHub OIDC provider:
   #   bunx cdk deploy AskCallsGithubDeploy -c askcalls:existingOidcProviderArn=arn:aws:iam::<account>:oidc-provider/token.actions.githubusercontent.com
   ```

   Copy the `DeployRoleArn` and `PreviewCleanupRoleArn` outputs into the GitHub variables
   (GitHub, below). The deploy role can only hand off to the bootstrap roles, and the
   bootstrap's CloudFormation execution role has `AdministratorAccess` by default; to narrow
   it, bootstrap with `--cloudformation-execution-policies` set to a policy covering S3,
   CloudFront and IAM.
3. Deploy the storage and model stacks once by hand, or let the first dev and production
   deploys do it (`deploy.yml` creates them):

   ```sh
   bunx cdk deploy AskCallsStorage-dev AskCallsStorage-prod AskCallsModels
   ```

   `AskCallsModels` prints `ModelsUrl` (`https://<id>.cloudfront.net`, or the custom domain):
   that is `EMBEDDING_MODEL_URL`. A dev deploy skips the model publish with a notice until the
   first production deploy (or this command) has created the stack.
4. Access keys for the app users, created by hand, never in CDK outputs or GitHub. One per
   environment, straight into Vercel (table below):

   ```sh
   aws iam create-access-key --user-name askcalls-app-prod   # → Vercel Production
   aws iam create-access-key --user-name askcalls-app-dev    # → Vercel Preview (all, and branch dev)
   ```

   The dev key can't touch `askcalls-prod`. To rotate: create a second key, update Vercel,
   redeploy, then `aws iam delete-access-key --user-name <user> --access-key-id <old>`.
5. Check CORS once a preview exists (S3 allows one `*` per origin, and `askcalls-*.vercel.app`
   covers both the deployment and the branch URLs of the `askcalls` project). A preflight must
   echo the preview's origin back:

   ```sh
   curl -si -X OPTIONS "https://askcalls-dev.s3.eu-central-1.amazonaws.com/probe" \
     -H "Origin: https://<a-preview-url>" -H "Access-Control-Request-Method: PUT" \
     -H "Access-Control-Request-Headers: content-type" | grep -i access-control-allow-origin
   ```

   (`checkBucketCors` and `checkCorsByPreflight` in `@askcalls/adapter-blob-s3` run the same
   checks from code.)
6. Optional, recommended: the model CDN on `models.askcalls.com` (the agent's default model
   host when an instance doesn't say). Request a certificate for it in ACM in **us-east-1**
   (CloudFront only reads certificates there), DNS-validated with the CNAME ACM gives you. Then
   set `askcalls:modelsDomain` (`models.askcalls.com`) and `askcalls:modelsCertificateArn` in
   `infra/cdk.json`, deploy `AskCallsModels`, and add a CNAME `models` → the
   `DistributionDomain` output at the domain's DNS provider (DNS only, no proxying). Until then
   use the CloudFront domain.
7. The embedding model: `deploy.yml` runs `bun run models:publish` on every deploy (dev and
   production) after the CDK step, with the deploy role; it publishes a build only when the
   pinned one is missing, then reads every file back through `ModelsUrl` and checks its hash,
   `Cache-Control` and CORS. Browsers verify every file's SHA-256 before using it. Manual
   publishing and the details: [`scripts/models/README.md`](../scripts/models/README.md).

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
   | `ADMIN_EMAILS` | the admin accounts (`oeharel@gmail.com`) | same | same |
   | `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | prod OAuth client | non-prod OAuth client | non-prod OAuth client |
   | `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | prod OAuth app (if used) | non-prod OAuth app | non-prod OAuth app |
   | `AUTH_REDIRECT_PROXY_URL` | — (unset) | `https://<DEV_DOMAIN>/api/auth` | `https://<DEV_DOMAIN>/api/auth` |
   | `DB_DRIVER` | `postgres` | — (set per deploy) | `postgres` |
   | `DATABASE_URL` | `main`, pooled | — (set per deploy) | `dev` branch, pooled |
   | `BLOB_DRIVER` | `s3` | `s3` | `s3` |
   | `S3_ENDPOINT` | — (unset: AWS S3) | — | — |
   | `S3_REGION` | `eu-central-1` | `eu-central-1` | `eu-central-1` |
   | `S3_BUCKET` | `askcalls-prod` | `askcalls-dev` | `askcalls-dev` |
   | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | `askcalls-app-prod` access key | `askcalls-app-dev` access key | `askcalls-app-dev` access key |
   | `S3_KEY_PREFIX` | — (unset) | — (set per deploy: `preview/pr-<n>/`) | `dev/` |
   | `TRANSCRIPTION_PROVIDER` | `elevenlabs` | `elevenlabs` (overridden to `mock` per deploy without `real-providers`) | `elevenlabs` |
   | `ELEVENLABS_API_KEY` | prod key | non-prod key | non-prod key |
   | `LLM_PROVIDER` | `anthropic` | `anthropic` (overridden to `mock` like above) | `anthropic` |
   | `LLM_MODEL` | the production model | same | same |
   | `ANTHROPIC_API_KEY` | prod key | non-prod key | non-prod key |
   | `CRON_SECRET` | required (`openssl rand -base64 32`) | — | — |
   | `TELEMETRY` | `none`, or the backends in use (content-free) | `none` | `none` |
   | `EMBEDDING_MODEL_URL` | `ModelsUrl` of `AskCallsModels`: `https://models.askcalls.com` with the custom domain, else `https://<id>.cloudfront.net` | same | same |
   | `ASKCALLS_SKIP_MODEL_DOWNLOAD` | `1` | `1` | `1` |

   - `ASKCALLS_HOSTED=true` only in production: it locks the instance config, hides the offline
     toggle, and keeps the Auth.js test provider off.
   - Set `DB_DRIVER` and `BLOB_DRIVER` explicitly everywhere; the defaults (`postgres`, `s3`)
     match, but a set variable also locks the setting in `/admin/instance`.
   - `SCHEDULER` can stay unset: on Vercel it defaults to `vercel-cron`.
   - Never set `AUTH_TEST_PROVIDER` on Vercel; the test provider is for E2E only.
   - `S3_REGION` is required with AWS: the CSP's `connect-src` and the presigned URLs use the
     regional virtual-hosted endpoint (`https://askcalls-prod.s3.eu-central-1.amazonaws.com`).

### 4. GitHub

1. Create the `dev` branch from `master` (`git push origin master:dev`), and make it the base
   for feature pull requests.
2. Repository variables (Settings → Secrets and variables → Actions → Variables):
   `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `NEON_PROJECT_ID`, `NEON_PREVIEW_PARENT_BRANCH` (`dev`),
   `DEV_DOMAIN` (host only, e.g. `dev.askcalls.com`), `AWS_REGION` (`eu-central-1`),
   `AWS_DEPLOY_ROLE_ARN` and `AWS_PREVIEW_CLEANUP_ROLE_ARN` (the `AskCallsGithubDeploy`
   outputs). Role ARNs are not secret; GitHub holds no AWS keys.
3. Environments (Settings → Environments), each with secrets:

   | Environment | Deployment branches | Secrets |
   |---|---|---|
   | `preview` | any | `NEON_API_KEY`, `VERCEL_TOKEN` |
   | `dev` | `dev` only | `DATABASE_URL` (`dev` branch, **direct**), `VERCEL_TOKEN` |
   | `production` | `master` only | `DATABASE_URL` (`main`, **direct**), `VERCEL_TOKEN` |

   `DATABASE_URL` here only runs migrations; the app's pooled URL is in Vercel. The environment
   names matter: `askcalls-github-deploy` trusts only `dev` and `production` (either
   capitalization), `askcalls-github-preview-cleanup` only `preview`. The preview environment no
   longer needs the `S3_*` secrets the R2 setup used; delete them.
4. npm: `release.yml` publishes the agent by trusted publishing (OIDC), so GitHub holds no npm
   token. npm can only trust a workflow for a package that exists, so once:
   1. Publish the first version by hand, built the way `release.yml` builds it:
      `bun scripts/release/agent-package.ts --version 0.1.0`, then in `apps/agent/dist/npm`
      `npm login` and `npm publish --access public`. Tag that commit `v0.1.0` afterwards so the
      GitHub release matches; the npm step skips a version that is already published.
   2. On npmjs.com, `askcalls` → Settings → Trusted publishing → GitHub Actions: owner
      `Heknon`, repository `AskCalls`, workflow `release.yml`, no environment.
   3. Same page: Publishing access → require two-factor authentication and disallow tokens.

   Until the package exists a release skips the npm step and says so. The workflow publishes
   GHCR images with its own `GITHUB_TOKEN` (`packages: write`); make the package public under the
   repository's Packages settings after the first release.
5. Labels: `full-tests` (runs `ci.yml` on the PR) and `real-providers` (previews use the
   non-prod provider keys).
6. Production: every merge into `master` deploys once the full suite passes. To gate it, add
   required reviewers to the `production` environment (free on public repositories).
7. Security: turn on secret scanning and push protection (Settings → Code security), and
   private vulnerability reporting, which [SECURITY.md](../SECURITY.md) points reporters to.

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
