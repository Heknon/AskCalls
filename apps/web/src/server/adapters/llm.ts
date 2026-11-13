import { MockLlmProvider } from '@askcalls/adapter-mocks';
import type { LlmProvider } from '@askcalls/domain';
import type { InstanceConfig } from '../config/schema';
import { AdapterUnavailableError } from './errors';

/** LLM_PROVIDER → adapter. `none` turns "ask" off (null). llm-ai-sdk handles every SDK provider id. */
export async function buildLlm(config: InstanceConfig): Promise<LlmProvider | null> {
  switch (config.llm.provider) {
    case 'none':
      return null;
    case 'mock':
      return new MockLlmProvider();
    default:
      throw new AdapterUnavailableError('LLM', config.llm.provider);
  }
}
