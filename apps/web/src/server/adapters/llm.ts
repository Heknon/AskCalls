import { AiSdkLlmProvider, isLlmProviderId } from '@askcalls/adapter-llm-ai-sdk';
import { MockLlmProvider } from '@askcalls/adapter-mocks';
import type { LlmProvider } from '@askcalls/domain';
import type { InstanceConfig } from '../config/schema';
import { AdapterUnavailableError } from './errors';

/**
 * LLM_PROVIDER → adapter. `none`, or a hosted provider without its API key, turns managed
 * "ask" off (null); users can still ask with their own key. llm-ai-sdk handles every SDK
 * provider id.
 */
export async function buildLlm(
  config: InstanceConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<LlmProvider | null> {
  const { provider, apiKey, model, baseUrl } = config.llm;
  switch (provider) {
    case 'none':
      return null;
    case 'mock':
      return new MockLlmProvider();
    default: {
      if (!isLlmProviderId(provider)) throw new AdapterUnavailableError('LLM', provider);
      if (provider !== 'openai-compatible' && !apiKey) return null;
      if (provider === 'openai-compatible' && (!baseUrl || !model)) {
        throw new Error('LLM_BASE_URL and LLM_MODEL: required when LLM_PROVIDER=openai-compatible');
      }
      return new AiSdkLlmProvider({
        provider,
        fetch: fetchImpl,
        ...(apiKey ? { apiKey } : {}),
        ...(model ? { model } : {}),
        ...(baseUrl ? { baseUrl } : {}),
      });
    }
  }
}
