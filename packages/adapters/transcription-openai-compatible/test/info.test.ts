import { describe, expect, it } from 'vitest';
import { OpenAiCompatibleTranscriptionProvider } from '../src/index';
import { OPENAI_COMPATIBLE_TRANSCRIPTION_INFO as INFO } from '../src/info';

describe('OPENAI_COMPATIBLE_TRANSCRIPTION_INFO', () => {
  it('names this adapter and asks for the base URL', () => {
    const p = new OpenAiCompatibleTranscriptionProvider({ baseUrl: 'http://localhost:8000/v1' });
    expect(INFO.id).toBe(p.id);
    expect(INFO.baseUrl).toBe('required');
    expect(INFO.keyRequired).toBe(false);
  });
});
