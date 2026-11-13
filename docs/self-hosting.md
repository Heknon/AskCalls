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
3. **Storage:** a local folder, or an S3-compatible bucket (tested). When the bucket's CORS
   rules don't allow this instance's origin, the wizard shows the exact rule to add.
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
account and have no calls). Otherwise move the data:

```sh
askcalls backup /safe/place/askcalls.backup   # encrypted rows and blobs; useless without your keys
# switch DB_DRIVER / DATABASE_URL (or config.json), restart
askcalls restore /safe/place/askcalls.backup
```

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
