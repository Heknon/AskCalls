import type { UserDataDocs } from '@askcalls/client-core/userdata';
import { DomainError, type LlmProvider } from '@askcalls/domain';

export type OwnLlmKey = Extract<UserDataDocs['providers']['llm'], { mode: 'own' }>['key'];

/**
 * The user's own LLM, called straight from this browser with their key (spec 11.2a). The AI
 * SDK adapter is imported only when own-key mode is used.
 */
export async function ownKeyLlm(key: OwnLlmKey): Promise<LlmProvider> {
  const { AiSdkLlmProvider, isLlmProviderId } = await import('@askcalls/adapter-llm-ai-sdk');
  if (!isLlmProviderId(key.provider)) {
    throw new DomainError('unsupported', 'unknown LLM provider');
  }
  return new AiSdkLlmProvider({
    provider: key.provider,
    apiKey: key.apiKey,
    ...(key.model && { model: key.model }),
    ...(key.baseUrl && { baseUrl: key.baseUrl }),
    // Anthropic answers browsers only when the request says it comes from one on purpose.
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.provider === 'anthropic') {
        headers.set('anthropic-dangerous-direct-browser-access', 'true');
      }
      return fetch(input, { ...init, headers });
    },
  });
}
