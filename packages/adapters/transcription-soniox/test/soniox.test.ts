import { describeTranscriptionProviderContract } from '@askcalls/domain/contracts/providers';
import { describe, expect, it } from 'vitest';
import { SonioxTranscriptionProvider } from '../src/soniox';
import file from './fixtures/file.json';
import transcript from './fixtures/transcript-he-en.json';
import completed from './fixtures/transcription-completed.json';
import failed from './fixtures/transcription-error.json';
import processing from './fixtures/transcription-processing.json';
import queued from './fixtures/transcription-queued.json';
import { type Recording, replay } from './replay';

const KEY = 'soniox_test_0000000000000000';
const API = 'https://api.soniox.com/v1';
const TID = queued.id;
const FID = file.id;
const audio = new Uint8Array(160_000).fill(2);

const happy = (): Recording[] => [
  { method: 'POST', url: `${API}/files`, status: 201, json: file },
  { method: 'POST', url: `${API}/transcriptions`, status: 201, json: queued },
  { method: 'GET', url: `${API}/transcriptions/${TID}`, json: processing },
  { method: 'GET', url: `${API}/transcriptions/${TID}`, json: completed },
  { method: 'GET', url: `${API}/transcriptions/${TID}/transcript`, json: transcript },
  { method: 'DELETE', url: `${API}/transcriptions/${TID}`, status: 204 },
  { method: 'DELETE', url: `${API}/files/${FID}`, status: 204 },
];

function provider(recordings: Recording[], extra = {}) {
  const r = replay(recordings);
  return {
    r,
    p: new SonioxTranscriptionProvider({
      apiKey: KEY,
      fetch: r.fetch,
      pollIntervalMs: 0,
      ...extra,
    }),
  };
}

describeTranscriptionProviderContract('soniox (recorded)', {
  setup: async () => ({ provider: provider(happy()).p, sampleAudio: audio, mimeType: 'audio/ogg' }),
});

describe('SonioxTranscriptionProvider', () => {
  it('uploads, creates, polls, reads and deletes both resources', async () => {
    const { r, p } = provider(happy());
    await p.transcribe({ audio, mimeType: 'audio/ogg', language: 'he' });
    expect(r.calls.map((c) => `${c.method} ${c.url.pathname}`)).toEqual([
      'POST /v1/files',
      'POST /v1/transcriptions',
      `GET /v1/transcriptions/${TID}`,
      `GET /v1/transcriptions/${TID}`,
      `GET /v1/transcriptions/${TID}/transcript`,
      `DELETE /v1/transcriptions/${TID}`,
      `DELETE /v1/files/${FID}`,
    ]);
    expect(r.pending).toEqual([]);
    for (const c of r.calls) expect(c.headers.get('authorization')).toBe(`Bearer ${KEY}`);
    const upload = r.calls[0]!.body as FormData;
    expect((upload.get('file') as File).name).toBe('audio.ogg');
    expect(upload.get('client_reference_id')).toBeNull();
    expect(JSON.parse(r.calls[1]!.body as string)).toEqual({
      model: 'stt-async-v6',
      file_id: FID,
      enable_speaker_diarization: true,
      enable_language_identification: true,
      language_hints: ['he'],
    });
  });

  it('omits language hints for auto', async () => {
    const { r, p } = provider(happy());
    await p.transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' });
    expect(JSON.parse(r.calls[1]!.body as string).language_hints).toBeUndefined();
  });

  it('joins sub-word tokens into speaker segments', async () => {
    const { p } = provider(happy());
    const res = await p.transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' });
    expect(res.language).toBe('he');
    expect(res.durationSec).toBe(12.48);
    expect(res.segments.map((s) => [s.speaker, s.text])).toEqual([
      ['A', 'שלום, מדבר דני מהמוסך. הרכב שלך מוכן, המחיר הוא 1,250 שקל.'],
      ['B', 'Great, thanks. Can I pick it up tomorrow at nine?'],
      ['A', 'כן, בטח. נתראה מחר.'],
    ]);
    expect(res.segments[1]!.start).toBe(5.1);
  });

  it('deletes the upload when the job fails', async () => {
    const { r, p } = provider([
      { method: 'POST', url: `${API}/files`, status: 201, json: file },
      { method: 'POST', url: `${API}/transcriptions`, status: 201, json: queued },
      { method: 'GET', url: `${API}/transcriptions/${TID}`, json: failed },
      { method: 'DELETE', url: `${API}/transcriptions/${TID}`, status: 204 },
      { method: 'DELETE', url: `${API}/files/${FID}`, status: 204 },
    ]);
    const err = await p
      .transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' })
      .catch((e) => e);
    expect(err).toMatchObject({
      code: 'provider_error',
      details: { provider: 'soniox', error: 'audio_decode_error' },
    });
    expect(err.message).not.toContain('decode');
    expect(r.pending).toEqual([]);
  });

  it('deletes the upload when creating the job is refused', async () => {
    const { r, p } = provider([
      { method: 'POST', url: `${API}/files`, status: 201, json: file },
      { method: 'POST', url: `${API}/transcriptions`, status: 400, json: { message: 'x' } },
      { method: 'DELETE', url: `${API}/files/${FID}`, status: 204 },
    ]);
    await expect(
      p.transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' }),
    ).rejects.toMatchObject({ details: { status: 400 } });
    expect(r.pending).toEqual([]);
  });

  it('cleans up after an abort', async () => {
    const ac = new AbortController();
    const { r, p } = provider(
      [
        { method: 'POST', url: `${API}/files`, status: 201, json: file },
        { method: 'POST', url: `${API}/transcriptions`, status: 201, json: queued },
        { method: 'DELETE', url: `${API}/transcriptions/${TID}`, status: 204 },
        { method: 'DELETE', url: `${API}/files/${FID}`, status: 204 },
      ],
      { pollIntervalMs: 60_000 },
    );
    const run = p.transcribe({ audio, mimeType: 'audio/ogg', language: 'auto', signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    await expect(run).rejects.toBeDefined();
    expect(r.pending).toEqual([]);
  });

  it('times out', async () => {
    const { p } = provider(
      [
        { method: 'POST', url: `${API}/files`, status: 201, json: file },
        { method: 'POST', url: `${API}/transcriptions`, status: 201, json: queued },
        { method: 'GET', url: `${API}/transcriptions/${TID}`, json: processing },
        { method: 'DELETE', url: `${API}/transcriptions/${TID}`, status: 204 },
        { method: 'DELETE', url: `${API}/files/${FID}`, status: 204 },
      ],
      { pollIntervalMs: 5, timeoutMs: 1 },
    );
    await expect(
      p.transcribe({ audio, mimeType: 'audio/ogg', language: 'auto' }),
    ).rejects.toMatchObject({ message: 'Transcription provider timed out' });
  });

  it('has no client tokens for the async API', async () => {
    const { p } = provider([]);
    await expect(p.mintClientToken()).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('checks health', async () => {
    const { p } = provider([{ method: 'GET', url: `${API}/files?limit=1`, json: { files: [] } }]);
    expect(await p.healthCheck()).toMatchObject({ ok: true });
  });
});
