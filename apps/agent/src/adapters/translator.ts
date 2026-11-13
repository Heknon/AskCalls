import { AiSdkLlmProvider, isLlmProviderId } from '@askcalls/adapter-llm-ai-sdk';
import type { ApiClient } from '@askcalls/api-contract';
import { managedTranslator, type Providers, type Translator } from '@askcalls/client-core';
import { DomainError } from '@askcalls/domain';

type OwnKey = Extract<Providers['llm'], { mode: 'own' }>['key'];

/** Own-key mode (spec 11.2a): the transcript goes from this computer straight to the user's LLM. */
export function ownKeyTranslator(key: OwnKey): Translator {
  if (!isLlmProviderId(key.provider)) {
    throw new DomainError('unsupported', 'unknown LLM provider', { provider: key.provider });
  }
  const llm = new AiSdkLlmProvider({
    provider: key.provider,
    apiKey: key.apiKey,
    ...(key.model && { model: key.model }),
    ...(key.baseUrl && { baseUrl: key.baseUrl }),
  });
  return {
    id: `own:${llm.id}`,
    async translate(segments, { source, target, signal }) {
      const out = await llm.translate({
        segments: [...segments],
        source,
        target,
        ...(signal && { signal }),
      });
      return { segments: out, provider: llm.id, model: llm.model };
    },
  };
}

/**
 * The translator Settings → Providers selects: it follows "Ask about a call" (managed through
 * the server, own key, or off). Which languages comes from the user's translation rules, which
 * ingest reads from the same encrypted providers document.
 */
export function translatorFor(api: ApiClient, llm: Providers['llm']): Translator | null {
  if (llm.mode === 'off') return null;
  if (llm.mode === 'own') return ownKeyTranslator(llm.key);
  return managedTranslator(api);
}
