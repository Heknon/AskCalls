# AskCalls

**Ask your calls anything. End-to-end encrypted.**

AskCalls stores your phone-call transcripts and recordings so you can search them by contact, date, keyword, tag, intent or meaning, and ask an AI about any call. Encryption keys live only on your devices. The server indexes and returns your calls, but it cannot read them.

[askcalls.com](https://askcalls.com) · [Security](docs/threat-model.md) · [Self-hosting](docs/self-hosting.md) · [Architecture](docs/architecture.md)

---

## How it works

```
 Your device                         AskCalls server                 Storage
 ───────────                         ───────────────                 ───────
 transcript, audio, names  ──────▶  ciphertext, HMAC tokens,  ──────▶ Postgres + pgvector
 keys, decrypted results            vectors                           encrypted blobs

            Only your device sees plaintext.
```

1. **Upload or import.** Drop in audio, transcripts or both, one at a time or a whole folder. Audio without a transcript is transcribed. Duplicates are detected, so nothing is transcribed twice.
2. **Index on your device.** Keywords, contacts, intent tags and embeddings are computed locally. Words become keyed HMAC tokens, and text is encrypted before it leaves the device.
3. **Search.** Find calls by who, what or intent: exact or fuzzy keywords (Hebrew prefixes and typos included), contact, date range, tags, stars, or semantic meaning.
4. **Read and ask.** Results decrypt on your device. Ask the AI a question about a call, and only that one call is sent, with your consent, to the LLM provider.

## What the server can and cannot see

| The server stores | The server never sees |
| --- | --- |
| Encrypted transcripts, metadata, notes and recordings | Transcript text or individual words |
| HMAC tokens for keywords, contacts and tags | Phone numbers or contact names |
| Embeddings of redacted text | Tag names, notes or rule definitions |
| The day of each call and a duration bucket | Your keys, unwrapped |
| Wrapped keys and public keys | Decrypted recordings |

Plaintext reaches a third party only when you ask for it, one request at a time: audio to the transcription provider, and one decrypted call to the LLM provider when you ask about it. Those routes stream straight through and never write to disk, blob storage or logs. If you bring your own provider key, your device calls the provider directly and AskCalls is not in the path at all.

Every pull request runs a leak test: it seeds calls with known words and phone numbers, dumps the entire database and blob bucket, and fails if any of those strings appear in any encoding.

Read the full [threat model](docs/threat-model.md).

## Features

**Search and organize**
- One search bar with chips for Contact, Tag, Intent, Starred, Date and Meaning
- Fuzzy matching with "also matched" variants, Hebrew prefix handling, and your own synonyms
- Built-in intents (purchase interest, price question, complaint, service request, scheduling, legal, follow-up needed) plus intents you define with your own example sentences
- Stars, tags, notes and auto-tag rules that run at ingest and can be applied to existing calls

**Calls**
- Transcript with speakers and timestamps, search hits highlighted, mixed Hebrew and English rendered correctly
- Encrypted recording backups, compressed to Opus, with click-to-seek playback
- Open in WhatsApp, call back, and download as TXT or SRT
- Every call is signed by the device that ingested it, and the call view verifies the signature

**Import**
- Single upload or bulk upload of a folder, files or a ZIP
- Audio and transcript pairing by file name, an optional `manifest.csv`, and iPhone and Samsung file-name parsing
- A resumable queue with pause, retry and per-file status
- Transcript formats: TXT, SRT, VTT, and JSON from Whisper, Deepgram, AssemblyAI or generic segments

**Keys and accounts**
- Unlock with a passkey (WebAuthn PRF), a recovery code, or a passphrase
- Link more browsers and the desktop agent with a verified fingerprint
- Auto-lock, which wipes keys and decrypted data from memory
- Personal access tokens, an audit log, retention policies, full export decrypted on your device, and account deletion by crypto-shredding

**Languages**
- English and Hebrew, with full right-to-left support

## Get started

### Hosted

Sign up at [askcalls.com](https://askcalls.com). It's free during beta.

| Limit | Free tier |
| --- | --- |
| Calls | 500 |
| Transcription | 300 minutes a month |
| Recording backups | 2 GB |
| Ask about a call | 50 a day |
| Personal access tokens | 5 |

### On your own computer

```sh
bunx askcalls local
```

This runs the whole product on your machine, with no server, no Docker and no account: an embedded Postgres (PGlite with pgvector), local file storage, and the app bound to `127.0.0.1`. Your data stays encrypted on disk, and you still unlock it with a passkey, recovery code or passphrase.

```sh
askcalls backup ./askcalls-backup.tar   # encrypted, useless without your keys
askcalls restore ./askcalls-backup.tar
```

### Self-host

```sh
git clone https://github.com/Heknon/AskCalls.git
cd AskCalls/docker
docker compose up
```

This brings up Postgres with pgvector, MinIO and the web app. Open the app, and the first-run wizard walks you through the database, storage, sign-in, transcription and LLM. The first user to sign in becomes the admin.

Every setting is editable at `/admin/instance`. Any environment variable you set locks its setting. See [`.env.example`](.env.example) for the full list and [docs/self-hosting.md](docs/self-hosting.md) for backups and upgrades.

**Air-gapped:** `docker/docker-compose.offline.yml` adds a local Whisper server and Ollama. With `OFFLINE_MODE=true`, the instance refuses to start if any adapter points outside your network, and blocks all other outbound requests. Embedding models, ffmpeg and fonts ship inside the image.

## Use with your AI

The `askcalls` agent is a local MCP server that holds your keys. It searches, decrypts and ingests on your machine, so Claude, Cursor or any MCP client can work with your calls.

```sh
bunx askcalls login --url https://askcalls.com
bunx askcalls link
```

Then add it to your client.

**Claude Code**

```sh
claude mcp add --scope user askcalls -- bunx askcalls mcp
```

**Claude Desktop**

Open Settings → Developer → Edit Config, or edit the file directly:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "askcalls": {
      "command": "bunx",
      "args": ["askcalls", "mcp"]
    }
  }
}
```

Restart Claude Desktop after saving.

**Cursor**

`~/.cursor/mcp.json` for all projects, or `.cursor/mcp.json` for one:

```json
{
  "mcpServers": {
    "askcalls": {
      "command": "bunx",
      "args": ["askcalls", "mcp"]
    }
  }
}
```

**VS Code**

`.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "askcalls": {
      "type": "stdio",
      "command": "bunx",
      "args": ["askcalls", "mcp"]
    }
  }
}
```

**Windsurf**

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "askcalls": {
      "command": "bunx",
      "args": ["askcalls", "mcp"]
    }
  }
}
```

**Codex CLI**

```sh
codex mcp add askcalls -- bunx askcalls mcp
```

Or in `~/.codex/config.toml`:

```toml
[mcp_servers.askcalls]
command = "bunx"
args = ["askcalls", "mcp"]
```

Desktop apps don't always inherit your shell's `PATH`. If a client can't start the server, replace `bunx` with its full path from `which bunx`.

| Tool | What it does |
| --- | --- |
| `search_calls` | Keyword, contact, tag, intent, date and semantic search, with decrypted results |
| `get_call` | Full transcript and metadata, within a per-session decrypt budget |
| `list_recent_calls` | Recent calls with decrypted metadata |
| `ingest_call`, `ingest_batch` | Import a single call or a whole folder |
| `star_call`, `tag_call` | Update stars and tags |
| `list_tags`, `list_contacts` | Your decrypted catalogs |

Transcripts are returned as untrusted content in a delimited field, never as instructions.

Bulk import from the command line uses the same pipeline:

```sh
askcalls ingest ./calls --manifest manifest.csv --backup-recordings
```

### Remote MCP

A remote MCP endpoint serves clients that can't run a local process. It has no keys, so it offers only `inbox_upload`, `list_recent_calls` (ids, days and durations) and `account_status`. Inbox uploads are visible to the server in transit, encrypted to your inbox public key on arrival, and indexed the next time one of your devices unlocks.

Create a personal access token in **Settings → API and MCP**, then:

```sh
claude mcp add --transport http askcalls-remote https://askcalls.com/api/mcp \
  --header "Authorization: Bearer ac_..."
```

For clients configured with JSON:

```json
{
  "mcpServers": {
    "askcalls-remote": {
      "url": "https://askcalls.com/api/mcp",
      "headers": { "Authorization": "Bearer ac_..." }
    }
  }
}
```

## Providers

Each capability uses the instance's managed provider by default. In **Settings → Providers** you can switch any of them to your own key or turn it off.

| Capability | Options |
| --- | --- |
| Transcription | ElevenLabs Scribe v2 (default), OpenAI, Deepgram, Soniox, any OpenAI-compatible speech endpoint (local Whisper included), or Off |
| Ask about a call | Anthropic (default), OpenAI, Google, any OpenAI-compatible endpoint (Ollama and LM Studio included), or Off |
| Recording backups | The instance bucket, your own S3-compatible bucket (AWS S3, Cloudflare R2, MinIO, Backblaze B2), or Off |

Your own keys and bucket credentials are encrypted with your keys and used only on your device. Your device signs bucket requests itself, so neither your recordings nor your credentials pass through AskCalls.

## Verify what you run

AskCalls is MIT-licensed and builds reproducibly. Every release publishes the SHA-256 of each client JavaScript asset, so you can check that askcalls.com serves exactly the code in this repository. App routes load no third-party scripts and run under a strict CSP. [How to verify](docs/reproducible-builds.md).

Report vulnerabilities as described in [SECURITY.md](SECURITY.md).

## Architecture

Every external service sits behind a port with interchangeable adapters, selected by configuration. The domain package never imports a vendor SDK, and a lint rule enforces this in CI. Each adapter passes a shared contract test suite against a real instance.

| Port | Adapters |
| --- | --- |
| Database and search | Postgres with pgvector (any provider), PGlite |
| Blob storage | S3-compatible, local file system |
| Transcription | ElevenLabs, OpenAI, Deepgram, Soniox, OpenAI-compatible, mock |
| LLM | Vercel AI SDK (Anthropic, OpenAI, Google, OpenAI-compatible), mock |
| Telemetry | none (default), OpenTelemetry, Sentry or GlitchTip, PostHog, Umami |
| Scheduler | Vercel Cron, in-process |

Telemetry is off by default, opt-in for users, and content-free by construction: events are typed, a scrubber drops anything off the allow-list, and a test fails if a transcript word ever appears in an event.

```
apps/
  web/                 Next.js app: marketing site, app, API, remote MCP
  agent/               askcalls CLI: stdio MCP server, ingest, device linking, local mode
packages/
  domain/              entities, use cases, ports, contract test suites
  crypto/              WebCrypto key hierarchy, AEAD, wrapping, blind-index tokens, ECIES, signatures
  indexing/            Hebrew and English normalization, tokens, redaction, chunking, intents, rules
  transcript-formats/  TXT, SRT, VTT and JSON parsers
  client-core/         ingest, search, decryption and vocabulary sync for browser and agent
  api-contract/        zod schemas and a typed client for every route
  ui/                  shadcn/ui components, RTL-ready
  adapters/*           one package per adapter
docker/                Compose files for self-hosting and air-gapped installs
infra/                 askcalls.com's AWS (CDK): S3 for recordings, CloudFront for the model, GitHub OIDC roles
```

Read more in [docs/architecture.md](docs/architecture.md), and see [docs/adapters.md](docs/adapters.md) to write a new adapter.

## Development

Requires [Bun](https://bun.sh) and Docker.

```sh
bun install
bun run dev                # web app with mock providers
bun run check              # lint, typecheck, boundaries, unit and contract tests, leak test, infra/ synth
bun run test:integration   # API routes against real Postgres and MinIO
bun run test:e2e           # Playwright
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
