import { describe, expect, it } from 'vitest';
import { ConfigService } from './config/config-service';
import { buildContainer, SetupRequiredError } from './container';

describe('container', () => {
  it('wires mock adapters into every port', async () => {
    const resolved = new ConfigService({
      DB_DRIVER: 'memory',
      BLOB_DRIVER: 'memory',
      TRANSCRIPTION_PROVIDER: 'mock',
      LLM_PROVIDER: 'mock',
      FREE_TIER_MAX_CALLS: '7',
    }).loadFromEnvOnly();
    const { ports, close } = await buildContainer(resolved);
    expect((await ports.users.healthCheck()).ok).toBe(true);
    expect((await ports.blobs.healthCheck()).ok).toBe(true);
    expect(ports.transcription?.id).toBe('mock');
    expect(ports.llm?.id).toBe('mock');
    expect(ports.limits.maxCalls).toBe(7);
    const user = await ports.users.create({ email: 'x@example.test' });
    expect(await ports.calls.count(user.id)).toBe(0);
    await close();
  });

  it('turns providers off with none', async () => {
    const resolved = new ConfigService({
      DB_DRIVER: 'memory',
      BLOB_DRIVER: 'memory',
      TRANSCRIPTION_PROVIDER: 'none',
      LLM_PROVIDER: 'none',
    }).loadFromEnvOnly();
    const { ports } = await buildContainer(resolved);
    expect(ports.transcription).toBeNull();
    expect(ports.llm).toBeNull();
  });

  it('refuses to build an incomplete instance', async () => {
    const resolved = new ConfigService({}).loadFromEnvOnly();
    await expect(buildContainer(resolved)).rejects.toBeInstanceOf(SetupRequiredError);
  });
});
