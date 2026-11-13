import { describeTranscriptionProviderContract } from '@askcalls/domain/contracts/providers';
import { describe, expect, it } from 'vitest';
import {
  OpenAiCompatibleTranscriptionProvider,
  parseVerboseJson,
  transcriptionsUrl,
} from '../src/openai-compatible';
import fasterWhisper from './fixtures/faster-whisper-verbose-json-he-en.json';
import verbose from './fixtures/verbose-json-he-en.json';
import { formField, replay } from './replay';

const LOCAL = 'http://127.0.0.1:8000/v1/audio/transcriptions';
const audio = new Uint8Array(64_000).fill(1);

function provider(
  json: unknown,
  extra: Partial<ConstructorParameters<typeof OpenAiCompatibleTranscriptionProvider>[0]> = {},
) {
  const r = replay([{ method: 'POST', url: LOCAL, json }]);
  return {
    r,
    p: new OpenAiCompatibleTranscriptionProvider({
      baseUrl: 'http://127.0.0.1:8000',
      fetch: r.fetch,
      ...extra,
    }),
  };
}

describeTranscriptionProviderContract('openai-compatible whisper.cpp (recorded)', {
  setup: async () => ({ provider: provider(verbose).p, sampleAudio: audio, mimeType: 'audio/wav' }),
});
describeTranscriptionProviderContract('openai-compatible faster-whisper (recorded)', {
  setup: async () => ({
    provider: provider(fasterWhisper).p,
    sampleAudio: audio,
    mimeType: 'audio/ogg',
  }),
});

describe('OpenAiCompatibleTranscriptionProvider', () => {
  it('accepts an origin, a /v1 root or the full URL', () => {
    expect(transcriptionsUrl('http://localhost:8000')).toBe(
      LOCAL.replace('127.0.0.1', 'localhost'),
    );
    expect(transcriptionsUrl('http://localhost:8000/v1/')).toBe(
      'http://localhost:8000/v1/audio/transcriptions',
    );
    expect(transcriptionsUrl('https://api.groq.com/openai/v1')).toBe(
      'https://api.groq.com/openai/v1/audio/transcriptions',
    );
    expect(transcriptionsUrl('http://h/v1/audio/transcriptions')).toBe(
      'http://h/v1/audio/transcriptions',
    );
  });

  it('sends Whisper verbose_json with segment timestamps and no key by default', async () => {
    const { r, p } = provider(fasterWhisper, { model: 'Systran/faster-whisper-large-v3' });
    await p.transcribe({ audio, mimeType: 'audio/ogg', language: 'he' });
    const req = r.calls[0]!;
    expect(req.headers.get('authorization')).toBeNull();
    expect(formField(req, 'model')).toBe('Systran/faster-whisper-large-v3');
    expect(formField(req, 'response_format')).toBe('verbose_json');
    expect(formField(req, 'timestamp_granularities[]')).toBe('segment');
    expect(formField(req, 'language')).toBe('he');
  });

  it('sends the optional key', async () => {
    const { r, p } = provider(verbose, { apiKey: 'local-key' });
    await p.transcribe({ audio, mimeType: 'audio/wav', language: 'auto' });
    expect(r.calls[0]!.headers.get('authorization')).toBe('Bearer local-key');
    expect(formField(r.calls[0]!, 'model')).toBe('whisper-1');
  });

  it('maps segments and language names', async () => {
    const res = await provider(verbose).p.transcribe({
      audio,
      mimeType: 'audio/wav',
      language: 'auto',
    });
    expect(res.language).toBe('he');
    expect(res.durationSec).toBe(12.48);
    expect(res.segments.map((s) => s.text)).toEqual([
      'שלום, מדבר דני מהמוסך.',
      'הרכב שלך מוכן, המחיר הוא 1,250 שקל.',
      'Great, thanks. Can I pick it up tomorrow at nine?',
      'כן, בטח. נתראה מחר.',
    ]);
  });

  it('falls back to words, then text', () => {
    const { segments: _, ...wordsOnly } = fasterWhisper;
    const fromWords = parseVerboseJson(wordsOnly);
    expect(fromWords.segments.map((s) => s.text).join(' ')).toBe(fasterWhisper.text);
    expect(fromWords.segments[0]!.start).toBe(0.12);
    expect(parseVerboseJson({ text: ' hello ', duration: 2 }).segments).toEqual([
      { start: 0, end: 2, text: 'hello' },
    ]);
  });

  it('declares capabilities from options', () => {
    const p = new OpenAiCompatibleTranscriptionProvider({
      baseUrl: 'http://localhost:8000',
      browserDirect: true,
      maxChunkBytes: 1000,
    });
    expect(p.capabilities).toEqual({
      clientTokens: false,
      browserDirect: true,
      maxChunkBytes: 1000,
    });
    expect(() => new OpenAiCompatibleTranscriptionProvider({ baseUrl: 'not a url' })).toThrow();
  });

  it('treats a server without /v1/models as reachable', async () => {
    const r = replay([
      { method: 'GET', url: 'http://127.0.0.1:8080/v1/models', status: 404, json: {} },
    ]);
    const p = new OpenAiCompatibleTranscriptionProvider({
      baseUrl: 'http://127.0.0.1:8080',
      fetch: r.fetch,
    });
    expect(await p.healthCheck()).toMatchObject({ ok: true, message: 'reachable' });
    const down = new OpenAiCompatibleTranscriptionProvider({
      baseUrl: 'http://127.0.0.1:8080',
      fetch: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    expect(await down.healthCheck()).toMatchObject({ ok: false, message: 'unreachable' });
  });
});
