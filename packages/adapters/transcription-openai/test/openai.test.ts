import { describeTranscriptionProviderContract } from '@askcalls/domain/contracts/providers';
import { describe, expect, it } from 'vitest';
import { OpenAiTranscriptionProvider, responseModeFor } from '../src/openai';
import diarized from './fixtures/diarized-json-he-en.json';
import plain from './fixtures/json-he-en.json';
import verbose from './fixtures/verbose-json-he-en.json';
import { formField, replay } from './replay';

const KEY = 'sk-test-0000000000000000';
const URL_ = 'https://api.openai.com/v1/audio/transcriptions';
const audio = new Uint8Array(160_000).fill(9);

function provider(json: unknown, model?: string, status = 200) {
  const r = replay([{ method: 'POST', url: URL_, json, status }]);
  return {
    r,
    p: new OpenAiTranscriptionProvider({
      apiKey: KEY,
      fetch: r.fetch,
      ...(model ? { model } : {}),
    }),
  };
}

describeTranscriptionProviderContract('openai gpt-4o-transcribe-diarize (recorded)', {
  setup: async () => ({
    provider: provider(diarized).p,
    sampleAudio: audio,
    mimeType: 'audio/ogg',
  }),
});
describeTranscriptionProviderContract('openai whisper-1 (recorded)', {
  setup: async () => ({
    provider: provider(verbose, 'whisper-1').p,
    sampleAudio: audio,
    mimeType: 'audio/ogg',
  }),
});
describeTranscriptionProviderContract('openai gpt-4o-transcribe (recorded)', {
  setup: async () => ({
    provider: provider(plain, 'gpt-4o-transcribe').p,
    sampleAudio: audio,
    mimeType: 'audio/ogg',
  }),
});

describe('OpenAiTranscriptionProvider', () => {
  it('picks the response format each model supports', () => {
    expect(responseModeFor('gpt-4o-transcribe-diarize')).toBe('diarized_json');
    expect(responseModeFor('whisper-1')).toBe('verbose_json');
    expect(responseModeFor('gpt-4o-transcribe')).toBe('json');
    expect(responseModeFor('gpt-4o-mini-transcribe')).toBe('json');
  });

  it('sends the diarize model with diarized_json and chunking', async () => {
    const { r, p } = provider(diarized);
    await p.transcribe({ audio, mimeType: 'audio/mp4', language: 'he' });
    const req = r.calls[0]!;
    expect(req.headers.get('authorization')).toBe(`Bearer ${KEY}`);
    expect(formField(req, 'model')).toBe('gpt-4o-transcribe-diarize');
    expect(formField(req, 'response_format')).toBe('diarized_json');
    expect(formField(req, 'chunking_strategy')).toBe('auto');
    expect(formField(req, 'timestamp_granularities[]')).toBeNull();
    expect(formField(req, 'language')).toBe('he');
    const file = formField(req, 'file') as File;
    expect(file.name).toBe('audio.m4a');
    expect(file.size).toBe(audio.length);
  });

  it('maps diarized segments', async () => {
    const res = await provider(diarized).p.transcribe({
      audio,
      mimeType: 'audio/ogg',
      language: 'auto',
    });
    expect(res.durationSec).toBe(12.48);
    expect(res.language).toBeNull();
    expect(res.segments.map((s) => [s.speaker, s.text])).toEqual([
      ['A', 'שלום, מדבר דני מהמוסך.'],
      ['A', 'הרכב שלך מוכן, המחיר הוא 1,250 שקל.'],
      ['B', 'Great, thanks. Can I pick it up tomorrow at nine?'],
      ['A', 'כן, בטח. נתראה מחר.'],
    ]);
  });

  it('uses verbose_json segment timestamps for whisper-1', async () => {
    const { r, p } = provider(verbose, 'whisper-1');
    const res = await p.transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' });
    expect(formField(r.calls[0]!, 'response_format')).toBe('verbose_json');
    expect(formField(r.calls[0]!, 'timestamp_granularities[]')).toBe('segment');
    expect(formField(r.calls[0]!, 'language')).toBeNull();
    expect(res.language).toBe('he');
    expect(res.segments).toHaveLength(4);
    expect(res.segments[2]).toEqual({
      start: 5.1,
      end: verbose.segments[2]!.end,
      text: 'Great, thanks. Can I pick it up tomorrow at nine?',
    });
  });

  it('returns one untimed segment for json-only models', async () => {
    const { r, p } = provider(
      { ...plain, usage: { type: 'duration', seconds: 13 } },
      'gpt-4o-transcribe',
    );
    const res = await p.transcribe({ audio, mimeType: 'audio/ogg', language: 'en' });
    expect(formField(r.calls[0]!, 'response_format')).toBe('json');
    expect(formField(r.calls[0]!, 'chunking_strategy')).toBeNull();
    expect(res.segments).toEqual([{ start: 0, end: 13, text: plain.text }]);
    expect(res.durationSec).toBe(13);
    const tokens = await provider(plain, 'gpt-4o-transcribe').p.transcribe({
      audio,
      mimeType: 'audio/ogg',
      language: 'en',
    });
    expect(tokens.segments[0]).toMatchObject({ start: 0, end: 0 });
    expect(tokens.durationSec).toBeNull();
  });

  it('throws content-free errors and has no client tokens', async () => {
    const { p } = provider({ error: { message: 'Invalid file: secret' } }, undefined, 400);
    const err = await p
      .transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' })
      .catch((e) => e);
    expect(err).toMatchObject({
      code: 'provider_error',
      details: { provider: 'openai', status: 400 },
    });
    expect(err.message).not.toContain('secret');
    await expect(p.mintClientToken()).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('checks health', async () => {
    const r = replay([
      { method: 'GET', url: 'https://api.openai.com/v1/models', json: { data: [] } },
    ]);
    const p = new OpenAiTranscriptionProvider({ apiKey: KEY, fetch: r.fetch });
    expect(await p.healthCheck()).toMatchObject({ ok: true });
  });
});
