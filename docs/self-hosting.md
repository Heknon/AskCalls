# Self-hosting AskCalls

AskCalls runs as one Next.js server with a database (Postgres with pgvector, or the built-in
PGlite) and blob storage (a local folder or an S3-compatible bucket). Everything else is
optional: transcription, "ask about a call", sign-in providers and telemetry can each be off.
The server stores ciphertext only; nothing in this guide changes that.

## Start

```sh
cd docker
docker compose up            # Postgres + pgvector, MinIO and the app on http://localhost:3000
```

Or without Docker: `bun install && bun run --cwd apps/web build`, then start
`apps/web/.next/standalone/apps/web/server.js` with `NODE_ENV=production`, `AUTH_SECRET` and
`ASKCALLS_DATA_DIR` set. The data directory holds `config.json`, the setup token, PGlite's
database and local-folder recordings.

`AUTH_SECRET` encrypts session cookies. Production without it has no sign-in at all:

```sh
export AUTH_SECRET="$(openssl rand -base64 32)"
```

## First run: the setup wizard

A fresh instance (no `config.json`, and settings still missing) opens the setup wizard at
`/setup`; every other page redirects there until setup is done.

1. **Setup token.** At start the server prints a one-time token to its log and writes it to
   `<data dir>/setup-token` (owner-only):

   ```
   AskCalls needs setup. Open the setup page and enter this setup token:

       http://localhost:3000/setup
       7K2QM-9XW4R-T3HJP-0VN8C
   ```

   The wizard asks for it first, and every setup request carries it. It is consumed when the
   admin account is created; a restart before then prints a new one.
2. **Database:** built-in (PGlite, in the data directory) or an external Postgres URL. An
   external database must pass the connection test (it reports the Postgres and pgvector
   versions) before you can continue.
3. **Storage:** a local folder, or an S3-compatible bucket (tested): AWS S3, Cloudflare R2,
   MinIO, Backblaze B2 or any other S3 API (`packages/adapters/blob-s3/README.md` has the
   endpoint and region for each). When the bucket's CORS rules don't allow this instance's
   origin, the wizard shows the exact rule to add. askcalls.com's own AWS setup (`infra/`, a
   CDK app) is specific to the hosted site; a self-hosted instance needs none of it.
4. **Sign-in:** local accounts, Google, GitHub and email links, each with its fields.
5. **Transcription and AI:** for each, off, a cloud provider with a key, or a local
   OpenAI-compatible server (Whisper for transcription, Ollama or vLLM for questions).
6. **Offline mode:** on or off; see below.
7. **Admin account:** an email with a passkey, or with a password when local accounts are on.
   Finishing writes `config.json`, creates the admin in the new database, signs you in and
   opens onboarding.

### Why a setup token

The first account on a fresh instance becomes its admin. On a public URL a stranger could reach
`/setup` before you do. The token proves the person running the wizard can read the server's
log or data directory. It is required from every address, loopback included: behind a reverse
proxy every request looks local, and a forwarded-for header can be forged. It holds 100 random
bits, is compared in constant time, setup routes allow 30 requests a minute per address, and it
stops working the moment the admin exists.

An instance configured completely by environment variables (no missing settings) skips the
wizard; there the first account to sign in becomes the admin, so sign in before you publish
the URL.

## Changing settings: `/admin/instance`

Admins configure every part of the instance at `/admin/instance`: database, blob storage,
sign-in methods, transcription, the LLM, the embedding model source, telemetry, limits, users
(make another account an admin by its email) and offline mode. Each card shows live health and
has **Test connection**, which runs the adapter's health check with the settings you entered,
before anything is saved. Saving validates the whole configuration first; a change that would
leave the instance unable to start is refused with the setting that's missing.

Most changes apply immediately: the server builds the new adapters, then swaps them in. The
database is the exception: a new database takes effect at the next start, and the page says so.

Secrets (provider keys, bucket keys, the database password, client secrets) are never sent to
the browser after saving. The page shows that a secret is set; **Replace** and **Remove** change
it. On disk they are in `config.json`, written with owner-only permissions.

### Settings set by the environment

Every setting can also come from an environment variable (the full list is in the spec,
section 3.5, and `apps/web/src/server/config/schema.ts`). A variable wins over `config.json`
and locks its setting: the admin page shows it read-only with "Set by the server environment"
(a secret shows its variable name, never its value). Invalid values stop the server at start
with every problem listed.

`ASKCALLS_HOSTED=true` (the official site only) makes the whole page read-only.

### Changing the database

The database can be switched in the admin page only while it is empty (you are the only
account and have no calls). Otherwise move the data with your database's own tools
(`pg_dump` / `pg_restore` for Postgres). A local-mode install (below) moves with
`askcalls backup` and `askcalls restore`.

## Telemetry

Off by default. `TELEMETRY` takes a comma list, and every backend has a free or self-hosted option:

| Backend | Gets | Settings |
| --- | --- | --- |
| `otel` | events, errors and timings as OTLP/HTTP JSON (logs and histograms), for any OpenTelemetry collector: Grafana, SigNoz, OpenObserve, Honeycomb, Datadog | `OTEL_EXPORTER_OTLP_ENDPOINT` (base URL), `OTEL_EXPORTER_OTLP_HEADERS` (`key=value,…`) |
| `sentry` | server and opted-in browser errors | `SENTRY_DSN`, from Sentry or a self-hosted GlitchTip |
| `posthog` | opted-in product events, without person profiles or GeoIP | `POSTHOG_KEY`, `POSTHOG_HOST` (default EU Cloud) |
| `umami` | cookieless marketing page views and opted-in product events, without user ids | `UMAMI_WEBSITE_ID`, `UMAMI_HOST` (default Umami Cloud) |

Whatever the backend, it receives only what the shared scrubber allows: ids, counts, durations, route names, error codes and stack frames as `file:line:col`; never a message, body, query string, header or anything a user typed ([threat model, Telemetry](threat-model.md#telemetry)). Users opt in to product events and browser error reports in Settings → Privacy; until they do, nothing about their use is sent. In offline mode every backend must be on your network.

## Backups

Back up the data directory (it contains `config.json` with your secrets: keep it private) and,
for external services, the Postgres database and the bucket. Everything user-owned in them is
already encrypted on users' devices; a backup cannot be read without their keys, and losing
their keys loses the data, backup or not.

## Local accounts

`AUTH_LOCAL_ACCOUNTS=true` (or the Local accounts switch) lets people create an account with an
email and a passkey, or an email and a password (at least 12 characters, stored as an Argon2id
hash; ten attempts per address per 15 minutes). They need no outside service, which is why
offline mode requires them.

Passkey sign-in stays available on every self-hosted instance, so an admin who created a
passkey in the wizard can always sign in, whatever else is configured. These sign-in passkeys
are separate from the passkey that unlocks your calls in onboarding.

## Offline (air-gapped) mode

Offline mode blocks every request to a host outside your network: at the app level (every
adapter's HTTP requests go through a guard; Postgres, S3 and SMTP hosts are checked before a
connection opens) and in the Content-Security-Policy (browsers may only talk to this instance).
Local means loopback, private and link-local addresses, single-label names such as Docker
service names (`db`, `ollama`) and `.local`, `.internal`, `.lan` and `.home.arpa` names.

**From the admin page.** The Offline mode card lists every setting that would reach the
internet, with one-click fixes: a local Whisper server or Ollama in place of a cloud provider,
a local folder for storage, turning a sign-in method or telemetry backend off, turning local
accounts on. The switch stays disabled until the list is empty. The one-click local servers
assume `http://localhost:8000/v1` (Whisper) and `http://localhost:11434/v1` with `llama3.2`
(Ollama); adjust the URL on the Transcription or Ask card afterwards. A database outside your
network has no one-click fix: move it with backup and restore.

**From the environment.** `OFFLINE_MODE=true` forces offline mode and hides the switch. The
server then refuses to start while any setting points outside the local network, and names it:

```
Invalid configuration:
  - OFFLINE_MODE: llm.provider reaches api.anthropic.com, outside the local network
```

`docker/docker-compose.offline.yml` runs the whole stack on one machine: Postgres with pgvector,
MinIO, whisper.cpp's server and Ollama, on an internal network with no route out, with the app
set to use them and `OFFLINE_MODE=true`. Pull the images and models while online (the commands
are at the top of the file), then move them to the offline host.

The embedding model (multilingual-e5-small) and ffmpeg's WebAssembly are part of the image and
served by the app; in offline mode `EMBEDDING_MODEL_URL` is ignored.

## On your own computer: local mode

```sh
bunx askcalls local                 # http://localhost:4317, opens your browser
bunx askcalls local --port 5000 --no-open
```

`askcalls local` runs the whole product on one computer, with no Docker and no account
anywhere. It starts the same Next.js server as a self-hosted instance with `APP_MODE=local`,
PGlite (Postgres with pgvector, compiled to WebAssembly) and local-folder storage:

| Path in `~/.askcalls` (or `ASKCALLS_HOME`) | What |
| --- | --- |
| `db/` | PGlite's data directory: ciphertext, wrapped keys, tokens, hashes |
| `blobs/` | encrypted recordings |
| `config.json` | instance settings (edited at `/admin/instance`) next to the agent's own |
| `session-secret` | encrypts the browser's session cookie; owner-only, never backed up |
| `local.json` | the running server's pid and port, while it runs |

Local mode uses the same code paths as server mode; only the adapters and sign-in differ.
Settings you set in the environment still apply and lock as usual (for example
`OFFLINE_MODE=true`); the ones that would point elsewhere (database URL, bucket, sign-in
providers, the model host) are not passed to the local server.

**The web app.** The `askcalls` npm package ships the Next.js standalone build with its static
files, the embedding model, ONNX Runtime, ffmpeg.wasm and fonts (`apps/agent/web`, built by
`scripts/package-local-web.ts`), and the browser loads all of them from the local server. The
single binary instead downloads that bundle once, from the release of its own version, and
refuses it unless its SHA-256 equals the one compiled into the binary
(`scripts/build-agent-binary.ts`); `ASKCALLS_WEB_URL` points it at another copy and
`ASKCALLS_WEB_DIR` at an unpacked one. The server runs on Node.js 20+ when it is installed
(recommended), otherwise on Bun.

**Sign-in.** There is none: the instance has one user, created the first time you open it, and
that user is its admin. Each start makes a new random key and opens
`http://localhost:4317/login#key=<key>`; the key stays in the URL fragment (never sent in a
request line, a log or a Referer), is posted once and removed from the address bar, and the
session cookie lasts across restarts. Opened without the key, the app says to start it from the
terminal. With `--no-open` the link is printed instead. Unlocking your calls still needs your
passkey, recovery code or passphrase, so the data on disk stays encrypted if the computer is
lost.

**Loopback only.** The server listens on `127.0.0.1` and drops any connection whose socket's
remote address is not loopback; a `Host` header other than `localhost`, `127.0.0.1` or `[::1]`
with its port gets 421, which stops DNS-rebinding pages. Requests that passed that guard are
the only ones the app serves in local mode: started any other way (for example the plain
standalone `server.js` with `APP_MODE=local`), it answers 403 to everything.

**Transcription and AI.** Off by default. As the admin you choose them at `/admin/instance`:
off, a cloud provider with your key, or a local OpenAI-compatible server (a Whisper server,
Ollama). Settings → Providers also takes your own cloud keys, used straight from the browser.
With `OFFLINE_MODE=true` only local servers are allowed and the browser may reach nothing but
this server.

**Your AI client.** `askcalls mcp` uses the local instance with no `login` or `link`. While this
computer's agent is not linked, `askcalls local` listens on a random loopback port at
`/link/<random nonce>` and gives that URL to the server, whose app pages are the only ones that
carry it (and the only origin it answers). The first time you unlock in the browser, the app
creates a personal access token (`read write ask keys`) and a device link (the same handshake
as Settings → Devices) and posts both there. The agent checks the token, joins the link and
answers with the 6-digit fingerprint of its key; the browser sends your root key, encrypted to
that key, only if the fingerprint matches the key the server reports. The agent keeps the token
and the wrapped key in the OS keychain (or the `ASKCALLS_KEYSTORE_PASSPHRASE` file) and sets
itself to use `http://localhost:<port>`, replacing a previous `askcalls login`. Without a
keychain or that passphrase, linking is skipped and `askcalls login --url
http://localhost:4317` with `askcalls link` work as for any instance. When the local server is
not running, `askcalls mcp` answers each tool with "start it with askcalls local" and connects
as soon as it is up. It downloads no model: it uses the files the local server serves.

**Backup and restore.**

```sh
askcalls backup ./askcalls-backup.tar     # stop askcalls local first
askcalls restore ./askcalls-backup.tar    # into an empty ~/.askcalls; --force to replace data
```

Both refuse while `askcalls local` runs: the database is copied as files while nothing has it
open. The backup is a plain tar:

| Entry | What |
| --- | --- |
| `manifest.json` | `format: "askcalls-local-backup"`, `version: 1`, creation time, every directory, and every file's size and SHA-256 |
| `config.json` | instance settings with every secret removed; the manifest lists which (`config.secretsRemoved`) |
| `db/…` | PGlite's data directory |
| `blobs/…` | encrypted recordings (not the presign key, which is recreated) |

Restore checks every file against the manifest in a staging directory before it replaces
anything, keeps this computer's agent settings, and refuses another format version. Everything
in the backup is already encrypted: it is useless without one of your unlock methods, and
restoring it to a new computer means unlocking with your recovery code or passphrase (a passkey
works if it syncs to that computer). The format stays versioned so a later
`askcalls migrate --to <url>` can upload the same rows and blobs to another instance.

**Testing it.** `bun run --cwd apps/web test:local-mode` drives `askcalls local` end to end
(loopback binding, onboarding, the sample call, `askcalls mcp`, backup, wipe, restore).
`bun run test:e2e:local` runs the whole Playwright suite against `askcalls local` inside a
Linux network namespace with only loopback (`scripts/without-network.ts`, `unshare --net`),
and the browser also sends every non-loopback request to a closed proxy port.
