# Threat model

AskCalls stores phone-call transcripts and recordings so the server can index and return them but never read them. This document says what that promise covers, how it is built, and where it ends. Byte-level formats are in [packages/crypto/README.md](../packages/crypto/README.md); the code that enforces each rule is linked where it is described.

## Assets

| Asset | Where it lives |
| --- | --- |
| Transcript text, segments, speaker labels | Encrypted per call (`Call.transcriptCt`) |
| Call metadata: phone number, contact name, exact start time, title, notes, file name, signature | Encrypted per call (`Call.metaCt`) |
| Recordings | Encrypted, segmented blobs in S3-compatible storage or on disk |
| Tag names, contacts, rules, synonyms, custom intents, own provider keys and bucket credentials | Encrypted user documents (`UserData`) |
| Search vocabulary (the words you have, for fuzzy matching) | Encrypted, append-only deltas (`VocabDelta`) |
| The root key (RK) and everything derived from it | On your devices only |

## Adversaries

1. **The server operator, or anyone who takes over the server or its database and bucket.** Sees everything the server stores and every request it handles. The design goal: they learn no content. On askcalls.com this includes the infrastructure providers: Vercel (the app), Neon (Postgres) and AWS (recordings in private S3 buckets in `eu-central-1`, reachable only through per-environment IAM users and presigned URLs; `infra/`).
2. **Another user of the same instance.** Must never read or change your rows.
3. **A network attacker.** Defeated by TLS; nothing in this document depends on the network being private.
4. **A third-party provider** (transcription, LLM, telemetry backend). Receives plaintext only when you ask for it, one request at a time, and telemetry backends never receive content.
5. **Script injected into the app** (a compromised dependency, XSS). Limited by the CSP and by keeping keys non-extractable, but script running in the app origin while you are unlocked can read what you can read. This is the residual risk of any web app that decrypts in the browser.
6. **Someone with your unlocked device.** Out of scope beyond auto-lock.

## What the server sees

| The server stores | The server never sees |
| --- | --- |
| Ciphertext: transcripts, metadata, notes, snippets, user documents, vocabulary, recordings | Transcript text or individual words |
| HMAC tokens (8 bytes, `bigint`) of keywords, contacts, tags, audio fingerprints and content | Phone numbers or contact names |
| 384-dimension embeddings of redacted text chunks | Tag names, notes or rule definitions |
| The UTC day of each call and a duration bucket (<1 m, 1–5 m, 5–15 m, 15–60 m, 60 m+) | Your keys, unwrapped |
| Wrapped root keys (one per unlock method), the inbox public key, device signing public keys | Decrypted recordings |
| Account email, sign-in provider ids, audit events (ids, counts and codes only) | |

What the stored data still reveals, by design:

- **Volume and timing:** how many calls you have, on which days, roughly how long, and when you upload or search.
- **Token equality:** two calls containing the same keyword share a token, so the server can tell that calls overlap in vocabulary and which searches match which calls, without knowing the word. It can count how often a token occurs across your calls. Tokens are keyed per user (the index key derives from your RK), so tokens are not comparable across users and a dictionary attack needs your key.
- **Embeddings:** vectors of redacted chunks (phone numbers, emails and names replaced by placeholders before embedding). Embedding inversion can recover the gist of a passage from its vector; this is the price of server-side semantic search over ciphertext. Users who do not want it can avoid semantic search; the vectors are still stored at ingest in R1.
- **Search shape:** which kinds of filters a search used, and which result ids came back.

## Key hierarchy

- **RK:** 32 random bytes generated on your first device. It never leaves a device unwrapped.
- **KEK** and **index key:** HKDF-SHA256 from RK (`askcalls/v1/kek`, `askcalls/v1/index`), held as non-extractable WebCrypto keys. The KEK wraps per-call keys and encrypts user documents, vocabulary, snippets and the inbox private key; the index key computes every token.
- **DEK per call:** 32 random bytes; encrypts that call's transcript, metadata, snippets and recording; stored wrapped by the KEK with the call id in the associated data.
- **AEAD:** AES-256-GCM, 12-byte random nonce, a version byte. The associated data binds `userId ‖ callId ‖ field` (length-prefixed), so a ciphertext moved to another user, call or column fails to decrypt.
- **Recordings:** 1 MiB segments with nonces `prefix ‖ u32be(i)` and a final-segment flag in the associated data, so reordering, truncation and appended data all fail authentication.

## Unlocking

Each unlock method is a `Keyring` row holding RK wrapped by a key only that method can produce:

| Method | Wrapping key |
| --- | --- |
| Passkey | WebAuthn PRF output for a fixed salt, through HKDF. The authenticator never reveals the PRF secret; the server stores only the wrapped RK and the credential id. |
| Recovery code | 160 random bits shown once as 8 groups of 4 base32 characters, through HKDF. Onboarding cannot finish until you retype two groups. |
| Passphrase | Argon2id (64 MiB, 3 passes, 16-byte salt) when the browser lacks PRF; at least 12 characters with a strength meter. This is the one method an operator could attack offline, at Argon2's cost per guess. |
| Device link | A 32-byte secret in the OS keychain (the agent), wrapping RK locally. |

A wrong method fails the GCM tag; the server learns only that an unlock was attempted if the client then fetches data.

**Locking** (15 minutes idle by default, configurable, and on tab close) drops RK and the subkeys from memory, revokes Blob URLs and clears every decrypted store. The service worker caches only the static app shell, never API responses. Decrypted data lives in memory only.

## Linking devices

A new browser or the agent joins through a one-time session (10 minutes): it posts an ECDH P-256 public key, both devices show a 6-digit fingerprint of that key keyed with the session's one-time secret (so whoever relays the key cannot grind a matching one), you confirm they match, and the trusted device sends RK encrypted to the new key (ECIES: ECDH, HKDF, AES-GCM). The server relays ciphertext and stores only a hash of the link secret. Every link is in the audit log and can be revoked; in R1 revoking deletes the device's `Keyring` row but does not rotate RK, so a revoked device that kept RK can still decrypt what it could before.

## Integrity

Each device has an ECDSA P-256 signing key (non-extractable in browsers). At ingest it signs `sha256(callId ‖ contentTok ‖ sha256(transcript))`, and the signature sits inside the encrypted metadata. The call view verifies it and shows "Signed by <device>" or a warning. A server that swaps ciphertexts between calls fails the AEAD binding; one that replays your own old ciphertext for the same call is not detected in R1.

## Separation between users

Every query on a user-owned table filters by `userId` explicitly, and every route takes the user from the session or token, never from input. Postgres row-level security is the second line: user-scoped transactions switch to the `askcalls_app` role (no `BYPASSRLS`) and set `app.user_id` transaction-locally; each user-owned table has one policy matching that setting, so a query missing its filter returns nothing rather than another user's rows. The few lookups that run before a user is known (sign-in, token hash lookup, device-link join) and the cross-user jobs (expiry, retention) use an explicit bypass path that review can find by name. Details and the tests: [db-postgres README, Row-level security](../packages/adapters/db-postgres/README.md#row-level-security). Integration tests check that user A can never read or change user B's rows on every API route.

## Where plaintext crosses the server

Plaintext reaches the server only on these routes, each by your explicit action, each in transit only. They stream to the provider, hold bodies in memory, zero buffers where they can, never write to disk or blob storage, and never log bodies:

| Route | What passes through | Who sees it |
| --- | --- | --- |
| `POST /api/transcribe` | One audio chunk of a call you upload without a transcript, when the instance's managed provider transcribes it | The server in transit, and the transcription provider |
| `POST /api/ask` | One decrypted call and your question, after a consent prompt per request | The server in transit, and the LLM provider |
| `POST /api/inbox`, remote MCP `inbox_upload` | A transcript or audio sent by a client without keys | The server in transit only, until it is encrypted to your inbox public key |

Own-key mode skips the server entirely: your device calls the provider (or your own bucket) directly with credentials kept in your encrypted provider settings. The browser can only reach those origins because the server signs a direct-access cookie listing them (HMAC over your user id and the origins, HttpOnly, set by `PUT /api/settings/direct-access`), and the middleware adds the signed origins to `connect-src` for your pages only. Page script cannot widen it, and one user's cookie does nothing for another.

LLM prompts wrap the transcript in delimiters with a system instruction to treat it as untrusted data (`wrapTranscript`, `ASK_SYSTEM_PROMPT`), because a transcript can contain text that looks like instructions.

## The inbox

Clients that hold no keys (the remote MCP endpoint, scripts) upload to the inbox. The server encrypts the payload to your inbox public key at once (ephemeral ECDH P-256, HKDF, AES-GCM), discards the plaintext and stores only the `InboxItem`. Your next unlocked device decrypts it with the inbox private key (itself encrypted by the KEK), runs the full on-device ingest, creates the call and deletes the item. Unprocessed items expire. The UI and the docs say plainly that inbox uploads were visible to the server in transit; nothing stronger can be promised for a client that has no keys.

## Code delivery

End-to-end encryption in a web app is only as good as the JavaScript the server sends. AskCalls narrows that gap in four ways:

- **Strict CSP on app routes.** `/app/**` and `/admin/**` load scripts from their own origin and the per-response nonce only (`script-src 'self' 'nonce-…' 'wasm-unsafe-eval' 'strict-dynamic'`), with no `'unsafe-inline'` or `'unsafe-eval'` in production and no third-party script. `connect-src` lists the instance's own origin, its blob storage, its model host and the signed own-key origins. The fast checks drive the real middleware for every app page in every storage mode, including forged direct-access cookies (`apps/web/src/middleware.csp.test.ts`).
- **Same-origin assets.** Fonts, ONNX Runtime, ffmpeg.wasm and (by default) the embedding model are served from the app's origin, never from a CDN.
- **Pinned model files.** The embedding model may come from an instance-configured host instead (`EMBEDDING_MODEL_URL`, e.g. `https://models.askcalls.com`, which on askcalls.com is CloudFront in front of a private S3 bucket), because 35 MB per deployment is wasteful. That host is trusted for availability only: the app ships the SHA-256 of every model file (`apps/web/src/client/assets.ts`), the embedding worker fetches the files itself and checks each hash before transformers.js or ONNX Runtime sees a byte, and a mismatch fails the load. A compromised model host can deny service but cannot change the model. The host's origin is added to `connect-src` only; ONNX Runtime's JavaScript and WebAssembly stay same-origin, and offline mode ignores the setting. The agent downloads from its instance's model host under the same pins. See [scripts/models/README.md](../scripts/models/README.md#hosting).
- **Reproducible builds.** Two builds of the same commit produce byte-identical client JavaScript, and every release publishes the SHA-256 of each asset, so anyone can check what askcalls.com serves against the source: [reproducible-builds.md](reproducible-builds.md). This detects a targeted or silent change after the fact; it does not stop a malicious server from serving different code to one user on one visit. A signed desktop app (out of R1) would close that gap.

## Telemetry

Off by default. When an operator enables a backend (OpenTelemetry, Sentry or GlitchTip, PostHog, Umami), every event passes one scrubber (`packages/domain/src/telemetry.ts`) that rebuilds it from an allow-list: UUIDs, counts, durations, route names from the instance's own route table, error codes from a fixed list, enum values per event, and stack frames reduced to `file:line:col`. Messages, bodies, query strings, headers and any other field are dropped whatever the caller passes. Every adapter runs a contract test that plants transcript words, names and phone numbers in every field and fails if any reaches a request in any encoding. Product events and browser error reports are sent only when the account opted in (Settings → Privacy); marketing page views are cookieless and carry the path only.

## The leak test

On every pull request, the fast checks seed calls with known words, Hebrew and English names and phone numbers through the full client pipeline into the real route handlers, then dump every table (bytea as raw bytes) and every blob, and fail if any seeded string appears in UTF-8, UTF-16 or any normalized or token form. It runs twice: on the in-memory stores (`apps/web/src/server/leak.test.ts`) and on the Postgres adapter on PGlite with the fs blob store (`leak.pglite.test.ts`).

## Not covered

- Metadata listed under "What the server sees".
- A malicious server serving modified JavaScript to a target (detectable through published hashes, not preventable in a browser).
- Malware or a malicious extension on your device, or an attacker with your unlocked device.
- Plaintext you send to providers by choice (transcription, ask), which their retention terms govern. The default providers are configured for zero or minimal retention.
- Inbox uploads in transit.
- Key rotation after revoking a device (R1 deletes the wrapped key but does not re-encrypt).
- Deleting an account crypto-shreds the wrapped keys and deletes the rows and blobs; backups the operator keeps are their own policy, and they hold ciphertext only.

Report vulnerabilities as described in [SECURITY.md](../SECURITY.md).
