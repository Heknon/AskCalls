# @askcalls/adapter-transcription-deepgram

`TranscriptionProvider` for Deepgram pre-recorded speech-to-text (`TRANSCRIPTION_PROVIDER=deepgram`,
`DEEPGRAM_API_KEY`). Plain `fetch`, no SDK.

## Request

`POST https://api.deepgram.com/v1/listen?<options>` with the audio as the raw body
(`Content-Type: <mime type>`) and `Authorization: Token <key>`
([API reference](https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded),
[diarization](https://developers.deepgram.com/docs/diarization)).

| Query | Value |
| --- | --- |
| `model` | `nova-3` (the only Nova model that lists Hebrew, [models](https://developers.deepgram.com/docs/models-languages-overview)) |
| `utterances` | `true` (segments) |
| `diarize_model` | `latest` (the boolean `diarize` is deprecated; sending both is rejected) |
| `smart_format`, `punctuate` | `true` |
| `language` / `detect_language` | the hint's primary subtag, or `detect_language=true` for `auto` |
| `mip_opt_out` | `true` by default (option `mipOptOut`) |

## Retention

`mip_opt_out=true` opts the request out of Deepgram's Model Improvement Program; Deepgram then keeps
the data only as long as needed to process the request
([MIP](https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program)).
Deepgram charges more for opted-out requests; set `mipOptOut: false` only deliberately.

## Response mapping

`results.utterances[]` (`start`, `end`, `transcript`, `speaker`) become segments, speakers relabelled
`A`, `B`… When utterances are missing, the adapter groups `channels[0].alternatives[0].words` by
speaker and pauses. `channels[0].detected_language` is the language and `metadata.duration` the
duration.

## Capabilities

| | Value | Evidence |
| --- | --- | --- |
| `clientTokens` | `false` | `POST /v1/auth/grant` mints JWTs valid for a time window (default 30 s), not single-use, so a client could send any number of requests within the TTL and bypass the minute quota. `mintClientToken()` throws `DomainError('unsupported')`. |
| `browserDirect` | `true` | Preflight `OPTIONS /v1/listen` with a foreign `Origin` on 2026-11-13 echoed that origin, allowed `GET,POST` and the `authorization` and `content-type` headers. |
| `maxChunkBytes` | 100 MiB | Deepgram's docs state no upload size limit; processing over 10 minutes returns 504. 100 MiB is a conservative cap. |

## Errors

Non-2xx → `DomainError('provider_error' | 'rate_limited', …, { provider: 'deepgram', status })`,
body unread. `healthCheck()` sends `GET /v1/auth/token`.

## Tests

`test/deepgram.test.ts` runs the provider contract against `test/fixtures/nova-3-he-en.json` and
asserts the query parameters, auth header and raw body.
