# @askcalls/adapter-transcription-openai-compatible

`TranscriptionProvider` for any server that implements OpenAI's
`POST /v1/audio/transcriptions` with Whisper's `verbose_json`
(`TRANSCRIPTION_PROVIDER=openai-compatible`, `TRANSCRIPTION_BASE_URL`, optional key). This is the
air-gapped and local-mode option (spec 11.2b, 11.2c): a local Whisper server such as
faster-whisper-server / speaches, whisper.cpp's `whisper-server`, LocalAI or vLLM. Hosted
OpenAI-compatible APIs (e.g. Groq) work too.

## Request

`POST <base>/v1/audio/transcriptions`, multipart
([OpenAI reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create)):

| Field | Value |
| --- | --- |
| `file` | audio chunk, `audio.<ext>` |
| `model` | option `model`, default `whisper-1` (most local servers want their own name, e.g. `Systran/faster-whisper-large-v3`) |
| `response_format` | `verbose_json` |
| `timestamp_granularities[]` | `segment` |
| `language` | primary subtag of the hint; omitted for `auto` |
| Header | `Authorization: Bearer <key>` only when a key is configured |

`baseUrl` may be an origin (`http://localhost:8000`), a versioned root (`…/v1`,
`https://api.groq.com/openai/v1`) or the full transcription URL.

Server notes:

- **faster-whisper-server / speaches**: serves `/v1/audio/transcriptions` and `/v1/models`
  ([speaches](https://speaches.ai/)).
- **whisper.cpp `whisper-server`**: serves `/inference` by default; start it with
  `--inference-path /v1/audio/transcriptions` (or pass that full URL as `baseUrl`). Its README
  documents `json` only, so confirm your build returns `verbose_json` segments; with plain `json`
  the adapter falls back to one untimed segment. It has no `/v1/models`, so `healthCheck()` treats
  404 as "reachable"
  ([server README](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server)).

## Response mapping

`segments[]` (`start`, `end`, `text`) map one-to-one. Without segments the adapter groups `words[]`
by pauses; without either it returns the text as one segment. Language names (`hebrew`) and codes
are normalized. There are no speakers.

## Capabilities

| | Value | Notes |
| --- | --- | --- |
| `clientTokens` | `false` | No token API in the OpenAI-compatible surface. |
| `browserDirect` | option, default `false` | Depends on the server's CORS. Set `browserDirect: true` only for a server that answers preflights from the app origin. |
| `maxChunkBytes` | option, default 25 MB | OpenAI's limit; servers vary. |

## Tests

`test/openai-compatible.test.ts` runs the provider contract against a whisper.cpp-style
`verbose_json` (language name) and a faster-whisper-style one (ISO code plus words).
