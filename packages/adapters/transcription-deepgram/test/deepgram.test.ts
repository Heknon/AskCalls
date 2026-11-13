import { describeTranscriptionProviderContract } from '@askcalls/domain/contracts/providers';
import { describe, expect, it } from 'vitest';
import { DeepgramTranscriptionProvider, parseDeepgram } from '../src/deepgram';
import nova from './fixtures/nova-3-he-en.json';
import { replay } from './replay';

const KEY = 'dg_test_0000000000000000';
const LISTEN = /^https:\/\/api\.deepgram\.com\/v1\/listen\?/;
const audio = new Uint8Array(160_000).fill(5);

function provider(recordings: Parameters<typeof replay>[0], extra = {}) {
  const r = replay(recordings);
  return { r, p: new DeepgramTranscriptionProvider({ apiKey: KEY, fetch: r.fetch, ...extra }) };
}

describeTranscriptionProviderContract('deepgram (recorded)', {
  setup: async () => ({
    provider: provider([{ method: 'POST', url: LISTEN, json: nova }]).p,
    sampleAudio: audio,
    mimeType: 'audio/ogg',
  }),
});

describe('DeepgramTranscriptionProvider', () => {
  it('sends nova-3 with utterances, diarization, smart format and the MIP opt-out', async () => {
    const { r, p } = provider([{ method: 'POST', url: LISTEN, json: nova }]);
    await p.transcribe({ audio, mimeType: 'audio/webm', language: 'he' });
    const req = r.calls[0]!;
    const q = req.url.searchParams;
    expect(q.get('model')).toBe('nova-3');
    expect(q.get('utterances')).toBe('true');
    expect(q.get('diarize_model')).toBe('latest');
    expect(q.has('diarize')).toBe(false); // deprecated; sending both is rejected
    expect(q.get('smart_format')).toBe('true');
    expect(q.get('mip_opt_out')).toBe('true');
    expect(q.get('language')).toBe('he');
    expect(q.has('detect_language')).toBe(false);
    expect(req.headers.get('authorization')).toBe(`Token ${KEY}`);
    expect(req.headers.get('content-type')).toBe('audio/webm');
    expect(req.body).toEqual(audio);
  });

  it('detects the language for auto and can opt back into MIP', async () => {
    const { r, p } = provider([{ method: 'POST', url: LISTEN, json: nova }], { mipOptOut: false });
    await p.transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' });
    const q = r.calls[0]!.url.searchParams;
    expect(q.get('detect_language')).toBe('true');
    expect(q.has('language')).toBe(false);
    expect(q.has('mip_opt_out')).toBe(false);
  });

  it('maps utterances to segments', async () => {
    const { p } = provider([{ method: 'POST', url: LISTEN, json: nova }]);
    const res = await p.transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' });
    expect(res.language).toBe('he');
    expect(res.durationSec).toBe(12.48);
    expect(res.segments.map((s) => [s.speaker, s.text])).toEqual([
      ['A', 'שלום, מדבר דני מהמוסך.'],
      ['A', 'הרכב שלך מוכן, המחיר הוא 1,250 שקל.'],
      ['B', 'Great, thanks. Can I pick it up tomorrow at nine?'],
      ['A', 'כן, בטח. נתראה מחר.'],
    ]);
    expect(res.segments[2]!.start).toBe(5.1);
  });

  it('falls back to words when utterances are missing', () => {
    const { utterances: _, ...results } = nova.results;
    const res = parseDeepgram({ ...nova, results }, 'en');
    expect(res.segments.map((s) => s.speaker)).toEqual(['A', 'B', 'A']);
    expect(res.segments[1]!.text).toBe('Great, thanks. Can I pick it up tomorrow at nine?');
  });

  it('has no single-use client tokens', async () => {
    const { p } = provider([]);
    expect(p.capabilities.clientTokens).toBe(false);
    await expect(p.mintClientToken()).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('throws content-free errors', async () => {
    const { p } = provider([
      { method: 'POST', url: LISTEN, status: 400, json: { err_msg: 'bad audio: secret' } },
    ]);
    const err = await p
      .transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' })
      .catch((e) => e);
    expect(err).toMatchObject({
      code: 'provider_error',
      details: { provider: 'deepgram', status: 400 },
    });
    expect(err.message).not.toContain('secret');
  });

  it('checks health', async () => {
    const { r, p } = provider([
      { method: 'GET', url: 'https://api.deepgram.com/v1/auth/token', json: { scopes: [] } },
    ]);
    expect(await p.healthCheck()).toMatchObject({ ok: true });
    expect(r.calls[0]!.headers.get('authorization')).toBe(`Token ${KEY}`);
  });
});
