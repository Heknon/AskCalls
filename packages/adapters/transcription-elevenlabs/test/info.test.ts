import { describe, expect, it } from 'vitest';
import { ELEVENLABS_DEFAULT_MODEL, ElevenLabsTranscriptionProvider } from '../src/index';
import { ELEVENLABS_INFO } from '../src/info';

describe('ELEVENLABS_INFO', () => {
  it('names this adapter and lists its default model first', () => {
    const p = new ElevenLabsTranscriptionProvider({ apiKey: 'k' });
    expect(ELEVENLABS_INFO.id).toBe(p.id);
    expect(ELEVENLABS_INFO.models[0]?.id).toBe(ELEVENLABS_DEFAULT_MODEL);
    expect(ELEVENLABS_INFO.browserDirect).toBe(p.capabilities.browserDirect);
  });
});
