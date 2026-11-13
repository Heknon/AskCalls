# @askcalls/adapter-transcription-soniox

`TranscriptionProvider` for the Soniox async file API (`TRANSCRIPTION_PROVIDER=soniox`,
`SONIOX_API_KEY`). Plain `fetch`, no SDK. All requests use `Authorization: Bearer <key>`.

## Flow

([async transcription](https://docs.soniox.com/stt/async/async-transcription),
[API reference](https://docs.soniox.com/stt/api-reference/transcriptions/create_transcription))

1. `POST /v1/files` (multipart `file`) → `{ id }`.
2. `POST /v1/transcriptions` with JSON
   `{ model: "stt-async-v6", file_id, enable_speaker_diarization: true,
   enable_language_identification: true, language_hints?: ["he"] }`.
   `language_hints` is omitted for `auto`. No `client_reference_id`, webhook or context is sent.
3. Poll `GET /v1/transcriptions/{id}` every `pollIntervalMs` (default 1 s) until `completed`
   (`error` → `DomainError`; `timeoutMs`, default 10 min).
4. `GET /v1/transcriptions/{id}/transcript` → `{ text, tokens[] }`.
5. `DELETE /v1/transcriptions/{id}` and `DELETE /v1/files/{id}`, **in every outcome** (success,
   provider error, refused request, timeout or abort), without the caller's abort signal.

`stt-async-v6` is the current async model; `stt-async-v5` is deprecated and removed on
2026-12-15 ([models](https://docs.soniox.com/stt/models)).

## Retention

Soniox has no no-retention flag for the async API. Uploaded files and transcriptions stay until
deleted (auto-deleted after 30 days, [limits](https://docs.soniox.com/stt/async/limits-and-quotas)),
which is why the adapter deletes both as soon as it has the transcript. If a delete fails (network),
Soniox's 30-day expiry is the backstop.

## Response mapping

Tokens (`text` with its own leading space, `start_ms`, `end_ms`, `speaker`, `language`) are joined
into segments split on speaker changes and pauses; speakers `"1"`, `"2"` become `A`, `B`.
Translation tokens are ignored. The language is the most frequent token language; the duration is
`audio_duration_ms`.

## Capabilities

| | Value | Evidence |
| --- | --- | --- |
| `clientTokens` | `false` | `POST /v1/auth/temporary-api-key` accepts `usage_type` `transcribe_websocket` or `tts_rt` only, not the async file API ([docs](https://docs.soniox.com/stt/api-reference/auth/create_temporary_api_key)). `mintClientToken()` throws `DomainError('unsupported')`. |
| `browserDirect` | `true` | Preflights `OPTIONS /v1/files` and `/v1/transcriptions` with a foreign `Origin` on 2026-11-13 returned `access-control-allow-origin: *`, methods `DELETE, GET, OPTIONS, POST`, headers including `Authorization` and `Content-Type`. |
| `maxChunkBytes` | 100 MiB | No documented size limit (300 minutes per file, 10 GB total storage); conservative cap. |

## Tests

`test/soniox.test.ts` runs the provider contract against the recorded fixtures in
`test/fixtures/` (upload, queued → processing → completed, transcript with Hebrew/English sub-word
tokens) and asserts the request sequence, bodies, auth and cleanup on failure, abort and timeout.
