import { describeTranscriptionProviderContract } from '@askcalls/domain/contracts/providers';
import { describe, expect, it } from 'vitest';
import { ElevenLabsTranscriptionProvider } from '../src/elevenlabs';
import transcript from './fixtures/scribe-v2-he-en.json';
import token from './fixtures/single-use-token.json';
import { formField, replay } from './replay';

const KEY = 'sk_test_0000000000000000';
const STT = 'https://api.elevenlabs.io/v1/speech-to-text?enable_logging=false';
const audio = new Uint8Array(160_000).fill(3);

function provider(recordings: Parameters<typeof replay>[0], extra = {}) {
  const r = replay(recordings);
  return { r, p: new ElevenLabsTranscriptionProvider({ apiKey: KEY, fetch: r.fetch, ...extra }) };
}

describeTranscriptionProviderContract('elevenlabs (recorded)', {
  setup: async () => ({
    provider: provider([{ method: 'POST', url: STT, json: transcript }]).p,
    sampleAudio: audio,
    mimeType: 'audio/ogg',
  }),
});

describe('ElevenLabsTranscriptionProvider', () => {
  it('sends logging off, scribe_v2, diarization and the audio as multipart', async () => {
    const { r, p } = provider([{ method: 'POST', url: STT, json: transcript }]);
    await p.transcribe({ audio, mimeType: 'audio/ogg; codecs=opus', language: 'he-IL' });
    const req = r.calls[0]!;
    expect(req.method).toBe('POST');
    expect(req.url.searchParams.get('enable_logging')).toBe('false');
    expect(req.headers.get('xi-api-key')).toBe(KEY);
    expect(formField(req, 'model_id')).toBe('scribe_v2');
    expect(formField(req, 'diarize')).toBe('true');
    expect(formField(req, 'timestamps_granularity')).toBe('word');
    expect(formField(req, 'tag_audio_events')).toBe('false');
    expect(formField(req, 'language_code')).toBe('he');
    const file = formField(req, 'file') as File;
    expect(file.name).toBe('audio.ogg');
    expect(file.type).toBe('audio/ogg; codecs=opus');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(audio);
  });

  it('omits the language for auto-detection', async () => {
    const { r, p } = provider([{ method: 'POST', url: STT, json: transcript }]);
    await p.transcribe({ audio, mimeType: 'audio/webm', language: 'auto' });
    expect(formField(r.calls[0]!, 'language_code')).toBeNull();
    expect((formField(r.calls[0]!, 'file') as File).name).toBe('audio.webm');
  });

  it('maps words and speakers to segments', async () => {
    const { p } = provider([{ method: 'POST', url: STT, json: transcript }]);
    const res = await p.transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' });
    expect(res.language).toBe('he');
    expect(res.durationSec).toBe(12.48);
    expect(res.segments.map((s) => [s.speaker, s.text])).toEqual([
      ['A', 'שלום, מדבר דני מהמוסך. הרכב שלך מוכן, המחיר הוא 1,250 שקל.'],
      ['B', 'Great, thanks. Can I pick it up tomorrow at nine?'],
      ['A', 'כן, בטח. נתראה מחר.'],
    ]);
    expect(res.segments[0]!.start).toBe(0.12);
    expect(res.segments[1]!.start).toBe(5.1);
    expect(res.segments.every((s) => !s.text.includes('(laughs)'))).toBe(true);
  });

  it('uses a regional base URL', async () => {
    const eu = 'https://api.eu.residency.elevenlabs.io/v1/speech-to-text?enable_logging=false';
    const { r, p } = provider([{ method: 'POST', url: eu, json: transcript }], {
      baseUrl: 'https://api.eu.residency.elevenlabs.io/',
    });
    await p.transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' });
    expect(r.calls[0]!.url.host).toBe('api.eu.residency.elevenlabs.io');
  });

  it('mints single-use batch tokens', async () => {
    const { r, p } = provider([
      {
        method: 'POST',
        url: 'https://api.elevenlabs.io/v1/single-use-token/batch_scribe',
        json: token,
      },
    ]);
    const t = await p.mintClientToken();
    expect(t.token).toBe('sutkn_7d0c6a1f2b9e4c3a8f5d');
    expect(t.endpoint).toBe(STT);
    expect(t.expiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(r.calls[0]!.headers.get('xi-api-key')).toBe(KEY);
    expect(p.capabilities.clientTokens).toBe(true);
  });

  it('throws content-free errors with the HTTP status only', async () => {
    const { p } = provider([
      { method: 'POST', url: STT, status: 401, json: { detail: { message: 'secret detail' } } },
    ]);
    const err = await p
      .transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' })
      .catch((e) => e);
    expect(err).toMatchObject({
      name: 'DomainError',
      code: 'provider_error',
      details: { provider: 'elevenlabs', status: 401 },
    });
    expect(err.message).not.toContain('secret');
    const { p: limited } = provider([{ method: 'POST', url: STT, status: 429, json: {} }]);
    await expect(
      limited.transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('checks health with the key', async () => {
    const { p } = provider([
      { method: 'GET', url: 'https://api.elevenlabs.io/v1/models', json: [] },
    ]);
    expect(await p.healthCheck()).toMatchObject({ ok: true, message: 'connected' });
    const { p: bad } = provider([
      { method: 'GET', url: 'https://api.elevenlabs.io/v1/models', status: 401, json: {} },
    ]);
    expect(await bad.healthCheck()).toMatchObject({ ok: false, message: 'invalid API key' });
  });

  it('requires a key', () => {
    expect(() => new ElevenLabsTranscriptionProvider({ apiKey: '' })).toThrow();
  });
});
