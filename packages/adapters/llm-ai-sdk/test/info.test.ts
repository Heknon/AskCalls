import { describe, expect, it } from 'vitest';
import { DEFAULT_MODELS, LLM_PROVIDER_IDS } from '../src/index';
import { LLM_PROVIDERS } from '../src/info';

describe('LLM_PROVIDERS', () => {
  it('has one entry per provider id, default model first', () => {
    expect(LLM_PROVIDERS.map((p) => p.id)).toEqual([...LLM_PROVIDER_IDS]);
    for (const p of LLM_PROVIDERS) {
      const def = DEFAULT_MODELS[p.id as keyof typeof DEFAULT_MODELS];
      expect(p.models[0]?.id).toBe(def);
      expect(p.baseUrl === 'required').toBe(p.id === 'openai-compatible');
    }
  });
});
