import { describe, expect, it } from 'vitest';
import { OPENAI_DEFAULT_MODEL, OpenAiTranscriptionProvider } from '../src/index';
import { OPENAI_TRANSCRIPTION_INFO } from '../src/info';

describe('OPENAI_TRANSCRIPTION_INFO', () => {
  it('names this adapter and lists its default model first', () => {
    const p = new OpenAiTranscriptionProvider({ apiKey: 'k' });
    expect(OPENAI_TRANSCRIPTION_INFO.id).toBe(p.id);
    expect(OPENAI_TRANSCRIPTION_INFO.models[0]?.id).toBe(OPENAI_DEFAULT_MODEL);
    expect(OPENAI_TRANSCRIPTION_INFO.browserDirect).toBe(p.capabilities.browserDirect);
  });
});
