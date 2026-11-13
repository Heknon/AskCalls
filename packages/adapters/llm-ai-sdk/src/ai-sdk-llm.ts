import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type {
  GenerateText,
  HealthResult,
  LlmAskRequest,
  LlmProvider,
  LlmTranslateRequest,
} from '@askcalls/domain';
import { ASK_SYSTEM_PROMPT, DomainError, translateAligned, wrapTranscript } from '@askcalls/domain';
import {
  APICallError,
  generateText,
  type LanguageModel,
  type ModelMessage,
  RetryError,
  streamText,
} from 'ai';

export const LLM_PROVIDER_IDS = ['anthropic', 'openai', 'google', 'openai-compatible'] as const;
export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

export const isLlmProviderId = (id: string): id is LlmProviderId =>
  (LLM_PROVIDER_IDS as readonly string[]).includes(id);

/** Defaults when no model is configured. `openai-compatible` has none: the server decides. */
export const DEFAULT_MODELS: Record<Exclude<LlmProviderId, 'openai-compatible'>, string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-6.1-sol',
  google: 'gemini-3.8-flash',
};

/** API roots, for health checks (the SDK providers use the same defaults). */
const DEFAULT_BASE_URLS: Record<Exclude<LlmProviderId, 'openai-compatible'>, string> = {
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
};

export interface AiSdkLlmOptions {
  provider: LlmProviderId;
  /** Required for anthropic, openai and google; optional for openai-compatible (Ollama needs none). */
  apiKey?: string;
  model?: string;
  /** Override the API root, e.g. a proxy, or the OpenAI-compatible server (`http://localhost:11434/v1`). */
  baseUrl?: string;
  /** Answer length cap. Default 4096 tokens. */
  maxOutputTokens?: number;
  /** Segments per translation request; longer inputs go in several. Default 40. */
  translateBatchSegments?: number;
  fetch?: typeof fetch;
  /** Injects a prebuilt model (tests). */
  languageModel?: LanguageModel;
}

/** Content-free provider error: provider id and HTTP status only, never prompt or response text. */
function llmError(provider: string, e: unknown): DomainError {
  const cause = RetryError.isInstance(e) ? e.lastError : e;
  const status = APICallError.isInstance(cause) ? (cause.statusCode ?? null) : null;
  return new DomainError(
    status === 429 ? 'rate_limited' : 'provider_error',
    status ? `LLM provider returned HTTP ${status}` : 'LLM provider request failed',
    { provider, status },
  );
}

const abortError = () => new DOMException('The ask request was aborted', 'AbortError');

/**
 * Builds the conversation. The transcript is wrapped as untrusted data (spec rule 2.6) and
 * prepended to the first user turn; the system prompt carries the instruction to treat it as
 * data. It never goes into the system prompt itself.
 */
export function buildMessages(req: LlmAskRequest): ModelMessage[] {
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...(req.history ?? []),
    { role: 'user', content: req.question },
  ];
  if (turns[0]!.role !== 'user') turns.unshift({ role: 'user', content: '' });
  const first = turns[0]!;
  turns[0] = {
    role: 'user',
    content: first.content
      ? `${wrapTranscript(req.transcriptText)}\n\n${first.content}`
      : wrapTranscript(req.transcriptText),
  };
  return turns.map((t) => ({ role: t.role, content: t.content }));
}

/**
 * LlmProvider over the Vercel AI SDK. One class covers Anthropic, OpenAI, Google and any
 * OpenAI-compatible endpoint (Ollama, LM Studio, vLLM). Streams answer text.
 */
export class AiSdkLlmProvider implements LlmProvider {
  readonly id: LlmProviderId;
  readonly model: string;
  private readonly languageModel: LanguageModel;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: AiSdkLlmOptions) {
    if (!isLlmProviderId(opts.provider)) {
      throw new DomainError('invalid', 'Unknown LLM provider', { provider: String(opts.provider) });
    }
    this.id = opts.provider;
    this.fetchImpl = opts.fetch ?? ((input, init) => fetch(input, init));
    const model =
      opts.model ??
      (opts.provider === 'openai-compatible' ? undefined : DEFAULT_MODELS[opts.provider]);
    if (!model) throw new DomainError('invalid', 'An LLM model name is required');
    this.model = model;
    this.languageModel = opts.languageModel ?? this.build(model);
  }

  private build(model: string): LanguageModel {
    const { provider, apiKey, baseUrl } = this.opts;
    const common = { ...(baseUrl ? { baseURL: baseUrl } : {}), fetch: this.fetchImpl };
    if (provider !== 'openai-compatible' && !apiKey) {
      throw new DomainError('invalid', 'An LLM API key is required', { provider });
    }
    switch (provider) {
      case 'anthropic':
        return createAnthropic({ apiKey, ...common })(model);
      case 'openai':
        return createOpenAI({ apiKey, ...common }).responses(model);
      case 'google':
        return createGoogle({ apiKey, ...common })(model);
      case 'openai-compatible':
        if (!baseUrl) throw new DomainError('invalid', 'An LLM base URL is required');
        return createOpenAICompatible({
          name: 'openai-compatible',
          baseURL: baseUrl,
          ...(apiKey ? { apiKey } : {}),
          fetch: this.fetchImpl,
        }).chatModel(model);
    }
  }

  async *ask(req: LlmAskRequest): AsyncIterable<string> {
    const result = streamText({
      model: this.languageModel,
      instructions: ASK_SYSTEM_PROMPT,
      messages: buildMessages(req),
      maxOutputTokens: this.opts.maxOutputTokens ?? 4096,
      maxRetries: 1,
      ...(req.signal ? { abortSignal: req.signal } : {}),
      // OpenAI's Responses API stores responses by default; ask must not leave a copy.
      providerOptions: { openai: { store: false } },
      // The SDK's default handler logs the error, which can include request bodies (the transcript).
      onError: () => {},
    });
    try {
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          if (part.text) yield part.text;
        } else if (part.type === 'error') {
          throw llmError(this.id, part.error);
        } else if (part.type === 'abort') {
          throw abortError();
        }
      }
    } catch (e) {
      if (e instanceof DomainError) throw e;
      if (req.signal?.aborted || (e as Error)?.name === 'AbortError') throw abortError();
      throw llmError(this.id, e);
    }
  }

  /**
   * Segment-aligned translation (TRANSLATE_SYSTEM_PROMPT, transcript wrapped as untrusted data):
   * batches of segments, each validated, repaired or split by `translateAligned`.
   */
  async translate(req: LlmTranslateRequest): Promise<string[]> {
    const generate: GenerateText = async ({ system, messages, signal }) => {
      try {
        const res = await generateText({
          model: this.languageModel,
          instructions: system,
          messages,
          maxOutputTokens: this.opts.maxOutputTokens ?? 8192,
          maxRetries: 1,
          ...(signal ? { abortSignal: signal } : {}),
          providerOptions: { openai: { store: false } },
        });
        return res.text;
      } catch (e) {
        if (signal?.aborted || (e as Error)?.name === 'AbortError') throw abortError();
        throw llmError(this.id, e);
      }
    };
    const size = Math.max(1, this.opts.translateBatchSegments ?? 40);
    const out: string[] = [];
    for (let i = 0; i < req.segments.length; i += size) {
      out.push(
        ...(await translateAligned(generate, {
          segments: req.segments.slice(i, i + size),
          source: req.source,
          target: req.target,
          ...(req.signal ? { signal: req.signal } : {}),
        })),
      );
    }
    return out;
  }

  /** Lists models with the key: proves reachability and auth without spending tokens. */
  async healthCheck(): Promise<HealthResult> {
    const started = Date.now();
    const { provider, apiKey } = this.opts;
    const root = (
      this.opts.baseUrl ?? (provider === 'openai-compatible' ? '' : DEFAULT_BASE_URLS[provider])
    ).replace(/\/+$/, '');
    if (!root) return { ok: false, message: 'not configured' };
    const headers: Record<string, string> = {};
    if (provider === 'anthropic') {
      headers['x-api-key'] = apiKey ?? '';
      headers['anthropic-version'] = '2023-06-01';
    } else if (provider === 'google') {
      headers['x-goog-api-key'] = apiKey ?? '';
    } else if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
    }
    try {
      const res = await this.fetchImpl(`${root}/models`, { method: 'GET', headers });
      await res.body?.cancel().catch(() => {});
      const latencyMs = Date.now() - started;
      if (res.ok) return { ok: true, message: 'connected', latencyMs };
      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'invalid API key', latencyMs };
      }
      return { ok: false, message: `HTTP ${res.status}`, latencyMs };
    } catch {
      return { ok: false, message: 'unreachable', latencyMs: Date.now() - started };
    }
  }
}
