import { describe, expect, it } from 'vitest';
import { ConfigService } from '../config/config-service';
import { buildLlm } from './llm';
import { buildTranscription } from './transcription';

const base = { DB_DRIVER: 'memory', BLOB_DRIVER: 'fs' };
const load = (env: Record<string, string>) =>
  new ConfigService({ ...base, ...env }).loadFromEnvOnly();

describe('providers without an API key', () => {
  it('boot with managed transcription and ask off', async () => {
    const { config, incomplete } = load({
      TRANSCRIPTION_PROVIDER: 'elevenlabs',
      LLM_PROVIDER: 'anthropic',
    });
    expect(incomplete).toEqual([]);
    expect(await buildTranscription(config)).toBeNull();
    expect(await buildLlm(config)).toBeNull();
  });

  it('turn on once the key is set', async () => {
    const { config } = load({
      TRANSCRIPTION_PROVIDER: 'elevenlabs',
      ELEVENLABS_API_KEY: 'el-key',
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: 'sk-ant-key',
    });
    expect((await buildTranscription(config))?.id).toBe('elevenlabs');
    expect((await buildLlm(config))?.id).toBe('anthropic');
  });
});
