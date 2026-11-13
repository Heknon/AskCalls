import { describe, expect, it } from 'vitest';
import { DEEPGRAM_DEFAULT_MODEL, DeepgramTranscriptionProvider } from '../src/index';
import { DEEPGRAM_INFO } from '../src/info';

describe('DEEPGRAM_INFO', () => {
  it('names this adapter and lists its default model first', () => {
    const p = new DeepgramTranscriptionProvider({ apiKey: 'k' });
    expect(DEEPGRAM_INFO.id).toBe(p.id);
    expect(DEEPGRAM_INFO.models[0]?.id).toBe(DEEPGRAM_DEFAULT_MODEL);
    expect(DEEPGRAM_INFO.browserDirect).toBe(p.capabilities.browserDirect);
  });
});
