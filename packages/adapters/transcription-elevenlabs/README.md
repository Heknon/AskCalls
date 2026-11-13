# @askcalls/adapter-transcription-elevenlabs

`TranscriptionProvider` for ElevenLabs Scribe (batch speech-to-text), the default provider
(`TRANSCRIPTION_PROVIDER=elevenlabs`, `ELEVENLABS_API_KEY`). Plain `fetch`, no SDK, so the same
class runs on the server (`/api/transcribe`), in the agent and in the browser (own key).

## Request

`POST https://api.elevenlabs.io/v1/speech-to-text` (`?enable_logging=false` with `zeroRetention`)
([API reference](https://elevenlabs.io/docs/api-reference/speech-to-text/convert))

| Part | Value |
| --- | --- |
| Header | `xi-api-key: <key>` |
| Query | `enable_logging=false` only with option `zeroRetention` (Zero Retention Mode). ElevenLabs refuses it with 403 `not_allowed` on plans other than Enterprise and trial, so it is off by default |
| `model_id` | `scribe_v2` (option `model`) |
| `file` | the audio chunk, filename `audio.<ext>` from the MIME type |
| `diarize` | `true` |
| `timestamps_granularity` | `word` |
| `tag_audio_events` | `false` |
| `file_format` | `other` (encoded audio, not raw PCM) |
| `language_code` | primary subtag of the hint (`he-IL` → `he`); omitted for `auto` |

Option `baseUrl` selects a data-residency origin, e.g. `https://api.eu.residency.elevenlabs.io`.

## Response mapping

The response's `words[]` (`type` = `word` | `spacing` | `audio_event`, `start`/`end` seconds,
`speaker_id`) become segments: a new segment starts on a speaker change, after a pause over 1.5 s,
or at a sentence end once a segment passes 20 s (hard cap 60 s). Audio events are dropped.
`speaker_0`, `speaker_1`… are relabelled `A`, `B`… by first appearance (per request; the ingest
pipeline reconciles chunks). `language_code` (ISO 639-3, e.g. `heb`) is normalized to `he`;
`audio_duration_secs` is the duration.

## Capabilities

| | Value | Evidence |
| --- | --- | --- |
| `clientTokens` | `true` | `POST /v1/single-use-token/batch_scribe` returns `{ "token": "sutkn_…" }`, single use, 15 min ([docs](https://elevenlabs.io/docs/api-reference/tokens/create)); the client sends it as `?token=` on the same endpoint. Spec 8 assumed tokens existed for realtime only; the batch type now exists. |
| `browserDirect` | `true` | Preflight `OPTIONS /v1/speech-to-text` with a foreign `Origin` on 2026-11-13 returned `access-control-allow-origin: *`, `access-control-allow-headers: *`, `access-control-allow-methods: POST, PATCH, OPTIONS, DELETE, GET, PUT`. |
| `maxChunkBytes` | 5 GB | "File size must be less than 5.0GB" (API reference). The `/api/transcribe` route caps chunks at 4 MB independently. |

`mintClientToken()` returns `{ token, expiresAt: now + 15 min, endpoint }` where `endpoint` carries
`enable_logging=false` when `zeroRetention` is on; direct-mode clients add `token=<token>` as a
query parameter and send the same multipart fields (`buildForm()`).

## Errors and logging

Non-2xx answers throw `DomainError('provider_error' | 'rate_limited', 'Transcription provider
returned HTTP <status>', { provider, status, reason? })`. On 401 and 403 only ElevenLabs'
`detail.status` code is read and mapped to `reason`: `zero_retention_unavailable` (`not_allowed`),
`missing_permission` (`missing_permissions`) or `invalid_key`; no provider text is kept. Every other
body is discarded unread. Nothing is logged.

`healthCheck()` sends `GET /v1/models` with the key.

## Tests

`test/elevenlabs.test.ts` runs the provider contract against `test/fixtures/scribe-v2-he-en.json`
(a Hebrew/English call in the documented response shape) through `test/replay.ts`, and asserts the
query, headers and every multipart field.
