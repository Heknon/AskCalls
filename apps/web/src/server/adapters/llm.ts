import { AiSdkLlmProvider, isLlmProviderId } from '@askcalls/adapter-llm-ai-sdk';
import { MockLlmProvider } from '@askcalls/adapter-mocks';
import type { LlmProvider } from '@askcalls/domain';
import type { InstanceConfig } from '../config/schema';
import { AdapterUnavailableError } from './errors';

/** LLM_PROVIDER → adapter. `none` turns "ask" off (null). llm-ai-sdk handles every SDK provider id. */
export async function buildLlm(config: InstanceConfig): Promise<LlmProvider | null> {
  const { provider, apiKey, model, baseUrl } = config.llm;
  switch (provider) {
    case 'none':
      return null;
    case 'mock':
      return new MockLlmProvider();
    default: {
      if (!isLlmProviderId(provider)) throw new AdapterUnavailableError('LLM', provider);
      if (provider !== 'openai-compatible' && !apiKey) {
        throw new Error(`llm.apiKey (ANTHROPIC_API_KEY): required when LLM_PROVIDER=${provider}`);
      }
      if (provider === 'openai-compatible' && (!baseUrl || !model)) {
        throw new Error('LLM_BASE_URL and LLM_MODEL: required when LLM_PROVIDER=openai-compatible');
      }
      return new AiSdkLlmProvider({
        provider,
        ...(apiKey ? { apiKey } : {}),
        ...(model ? { model } : {}),
        ...(baseUrl ? { baseUrl } : {}),
      });
    }
  }
}
