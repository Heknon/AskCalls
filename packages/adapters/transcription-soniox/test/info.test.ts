import { describe, expect, it } from 'vitest';
import { SONIOX_DEFAULT_MODEL, SonioxTranscriptionProvider } from '../src/index';
import { SONIOX_INFO } from '../src/info';

describe('SONIOX_INFO', () => {
  it('names this adapter and lists its default model first', () => {
    const p = new SonioxTranscriptionProvider({ apiKey: 'k' });
    expect(SONIOX_INFO.id).toBe(p.id);
    expect(SONIOX_INFO.models[0]?.id).toBe(SONIOX_DEFAULT_MODEL);
    expect(SONIOX_INFO.browserDirect).toBe(p.capabilities.browserDirect);
  });
});
