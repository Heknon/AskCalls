# @askcalls/adapter-transcription-openai

`TranscriptionProvider` for OpenAI speech-to-text (`TRANSCRIPTION_PROVIDER=openai`,
`OPENAI_API_KEY`). Plain `fetch`, no SDK.

## Request

`POST https://api.openai.com/v1/audio/transcriptions`, multipart, `Authorization: Bearer <key>`
([API reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create),
[guide](https://developers.openai.com/api/docs/guides/speech-to-text))

## Timestamps: which model

OpenAI's response formats differ by model:

| Model | Formats | Timestamps | Speakers |
| --- | --- | --- | --- |
| `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-transcribe` | `json` only | none | no |
| `gpt-4o-transcribe-diarize` | `json`, `text`, `diarized_json` | per segment | yes |
| `whisper-1` | `verbose_json` (+ `timestamp_granularities[]`) | per segment/word | no |

AskCalls needs timed segments, so the **default model is `gpt-4o-transcribe-diarize`** with
`response_format=diarized_json` and `chunking_strategy=auto` (required for input over 30 s). It is
the gpt-4o transcription model that returns timestamps, and it adds speakers. OpenAI lists it as
deprecated, shutting down **2027-02-26**; before then set `model` to `whisper-1` (timed segments,
no speakers) or a timed successor.

The adapter picks the request from the model name (`responseModeFor`):

- `*diarize*` → `diarized_json`, `chunking_strategy=auto`; segments keep their speaker (relabelled
  `A`, `B`… by first appearance).
- `whisper*` → `verbose_json`, `timestamp_granularities[]=segment`; language names (`hebrew`) are
  normalized to codes (`he`).
- anything else (`gpt-4o-transcribe`, …) → `json`; the result is **one untimed segment** from 0 to
  the billed duration (`usage.seconds` when OpenAI reports duration usage, else 0). Use it only when
  timestamps don't matter.

`language` is the primary subtag of the hint, omitted for `auto`.

## Retention

The endpoint has no per-request retention or logging flag. API inputs aren't used for training by
default; zero data retention is an account-level agreement with OpenAI.

## Capabilities

| | Value | Evidence |
| --- | --- | --- |
| `clientTokens` | `false` | Ephemeral client secrets exist only for Realtime sessions, not for `/v1/audio/transcriptions`. `mintClientToken()` throws `DomainError('unsupported')`. |
| `browserDirect` | `true` | Preflight `OPTIONS /v1/audio/transcriptions` with a foreign `Origin` on 2026-11-13 echoed that origin in `access-control-allow-origin`, allowed `GET, OPTIONS, POST` and echoed the requested headers (`authorization`, `content-type`). |
| `maxChunkBytes` | 25 MB | "File uploads are currently limited to 25 MB" (guide). |

## Errors

Non-2xx → `DomainError('provider_error' | 'rate_limited', …, { provider: 'openai', status })`, body
unread. `healthCheck()` sends `GET /v1/models`.

## Tests

`test/openai.test.ts` runs the provider contract for all three modes against
`test/fixtures/{diarized-json,verbose-json,json}-he-en.json` and asserts the multipart fields.
