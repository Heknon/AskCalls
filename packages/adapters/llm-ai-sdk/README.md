# @askcalls/adapter-llm-ai-sdk

`LlmProvider` ("ask about a call") over the Vercel AI SDK (`ai` 7.x) with
`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google` and `@ai-sdk/openai-compatible`
(`LLM_PROVIDER`, `LLM_MODEL`, `ANTHROPIC_API_KEY` → `llm.apiKey`, `LLM_BASE_URL`).

| `provider` | SDK call | Default model | Notes |
| --- | --- | --- | --- |
| `anthropic` | `createAnthropic({ apiKey, baseURL })(model)` → `POST /v1/messages` | `claude-sonnet-5-5` (current Claude Sonnet) | |
| `openai` | `createOpenAI(...).responses(model)` → `POST /v1/responses` | `gpt-6.1-sol` (OpenAI's balanced model) | sends `store: false` |
| `google` | `createGoogle(...)(model)` → `:streamGenerateContent` | `gemini-3.8-flash` (current stable Flash) | |
| `openai-compatible` | `createOpenAICompatible({ baseURL, apiKey? }).chatModel(model)` → `POST <base>/chat/completions` | none, `model` and `baseUrl` required | Ollama (`http://localhost:11434/v1`), LM Studio, vLLM |

Docs: [AI SDK streamText](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text),
[testing](https://ai-sdk.dev/docs/ai-sdk-core/testing),
[Anthropic provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic),
[OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai),
[Google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai),
[OpenAI-compatible](https://ai-sdk.dev/providers/openai-compatible-providers).

## Prompt (spec rule 2.6)

- `instructions` (the system prompt) is exactly `ASK_SYSTEM_PROMPT` from `@askcalls/domain`.
- The transcript goes through `wrapTranscript()` and is prepended to the **first user turn**,
  followed by the question (or the first question of a follow-up conversation). It never goes into
  the system prompt. `wrapTranscript` neutralizes a `</transcript>` inside the text.
- `history` turns follow in order; the new question is the last user turn.

## Privacy and errors

- `onError` is a no-op: the SDK's default handler logs errors, and an `APICallError` carries the
  request body (the transcript).
- OpenAI's Responses API stores responses by default; the adapter sends `store: false`.
- Errors are `DomainError('provider_error' | 'rate_limited', …, { provider, status })` with the HTTP
  status only (unwrapping the SDK's `RetryError`). Aborts surface as `AbortError`.
- `maxRetries: 1`, `maxOutputTokens` 4096 by default.

`healthCheck()` lists models (`GET <root>/models`) with the key, so it spends no tokens.

## Tests

`test/ai-sdk-llm.test.ts` uses `MockLanguageModelV4` from `ai/test` to check that the system prompt
and the wrapped transcript are sent and that text streams, plus error, abort and follow-up cases.
It also runs the real Anthropic provider against a recorded SSE stream, and checks the request
bodies the OpenAI, OpenAI-compatible and Google providers send.
