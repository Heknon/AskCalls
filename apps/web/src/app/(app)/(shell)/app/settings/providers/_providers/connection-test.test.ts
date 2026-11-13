import { createApiClient } from '@askcalls/api-contract';
import { describe, expect, it } from 'vitest';
import { sampleClip, testBucket, testTranscription } from './connection-test';

describe('connection tests', () => {
  it('makes a 3-second 16 kHz mono WAV', () => {
    const wav = sampleClip();
    const v = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe('RIFF');
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(v.getUint32(40, true)).toBe(3 * 16_000 * 2);
    expect(wav.length).toBe(44 + 3 * 16_000 * 2);
  });

  it('reports a rejected key and quota without provider text', async () => {
    const key = { provider: 'elevenlabs', apiKey: 'bad', baseUrl: null, model: null };
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('secret detail', { status: 401 })) as typeof fetch;
    try {
      expect(await testTranscription(createApiClient(), key)).toEqual({
        ok: false,
        reason: 'key',
        status: 401,
      });
    } finally {
      globalThis.fetch = realFetch;
    }
    const api = createApiClient({
      fetch: async () =>
        Response.json({ error: { code: 'quota_exceeded', message: 'x' } }, { status: 403 }),
    });
    expect(await testTranscription(api, null)).toMatchObject({ ok: false, reason: 'quota' });
  });

  it('maps bucket probes', async () => {
    const b = {
      id: 'b',
      endpoint: 'https://s3.example.test',
      bucket: 'x',
      region: '',
      accessKeyId: 'a',
      secretAccessKey: 's',
    };
    expect(await testBucket(async () => ({ ok: false, reason: 'cors_or_network' }), b)).toEqual({
      ok: false,
      reason: 'cors',
    });
    expect(
      await testBucket(async () => ({ ok: false, reason: 'unauthorized', status: 403 }), b),
    ).toEqual({ ok: false, reason: 'key', status: 403 });
    expect(await testBucket(async () => ({ ok: true }), b)).toMatchObject({ ok: true });
  });
});
