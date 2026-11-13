import { describe, expect, it } from 'vitest';
import { OWN_KEY_TRANSCRIPTION_PROVIDERS } from '../../../../../../../client/adapters/own-key-transcriber';
import { PROVIDER_ORIGINS } from '../../../../../../../client/direct-origins';
import { modelName, OWN_KEY_PROVIDERS, providerInfo, providerName } from './registry';

describe('provider registry', () => {
  it('offers exactly the transcription providers this browser can call', () => {
    expect(OWN_KEY_PROVIDERS.transcription.map((p) => p.id).sort()).toEqual(
      [...OWN_KEY_TRANSCRIPTION_PROVIDERS].sort(),
    );
  });

  it('has a CSP origin for every provider with a fixed endpoint', () => {
    for (const p of [...OWN_KEY_PROVIDERS.transcription, ...OWN_KEY_PROVIDERS.llm]) {
      if (p.baseUrl === 'fixed') expect(PROVIDER_ORIGINS[p.id], p.id).toBeDefined();
    }
  });

  it('names providers and models', () => {
    expect(providerName('elevenlabs')).toBe('ElevenLabs');
    expect(providerName('mock')).toBe('Mock');
    expect(providerName(null)).toBe('');
    const anthropic = providerInfo('llm', 'anthropic');
    expect(modelName(anthropic, null)).toBe('Claude Sonnet 5.5');
    expect(modelName(anthropic, 'custom-model')).toBe('custom-model');
  });
});
