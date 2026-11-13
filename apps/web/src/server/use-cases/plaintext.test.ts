import { DomainError, type TranscriptionProvider } from '@askcalls/domain';
import {
  decodeInboxPayload,
  deleteInboxItem,
  inboxAad,
  listInbox,
  uploadToInbox,
} from '@askcalls/domain/use-cases/inbox';
import {
  askAboutCall,
  mintTranscriptionToken,
  transcribeChunk,
} from '@askcalls/domain/use-cases/providers';
import { beforeEach, describe, expect, it } from 'vitest';
import { openInboxSeal, sealToInbox } from '../crypto/inbox-seal';
import { session } from '../testing/fixtures';
import { makeTestPorts, type TestPorts } from '../testing/ports';

let ports: TestPorts;
let a: string;
let b: string;

beforeEach(async () => {
  ports = makeTestPorts({ limits: { transcriptionMinutesPerMonth: 2, asksPerDay: 3 } });
  a = (await ports.users.create({ email: 'a@example.test' })).id;
  b = (await ports.users.create({ email: 'b@example.test' })).id;
});

const SECRET = 'Moshe ordered 42 crates, phone 0541234567';

async function collect(it: AsyncIterable<string>) {
  let s = '';
  for await (const c of it) s += c;
  return s;
}

describe('transcription quota (seconds per UTC month)', () => {
  it('charges the reported duration and refuses once the month is used up', async () => {
    // 16 kB/s estimate in the mock: 96 kB = 6 s per chunk.
    const audio = new Uint8Array(96_000);
    const first = await transcribeChunk(ports, session(a), {
      audio,
      mimeType: 'audio/ogg',
      language: 'he',
    });
    expect(first.usage).toEqual({ usedSeconds: 6, limitSeconds: 120 });
    expect(ports.mockTranscription.received.at(-1)).toEqual({ bytes: 96_000, language: 'he' });
    for (let i = 0; i < 19; i++) {
      await transcribeChunk(ports, session(a), { audio, mimeType: 'audio/ogg', language: 'auto' });
    }
    await expect(
      transcribeChunk(ports, session(a), { audio, mimeType: 'audio/ogg', language: 'auto' }),
    ).rejects.toMatchObject({ code: 'quota_exceeded', details: { quota: 'transcription_minutes' } });
    // Per user, and a new month starts fresh.
    await transcribeChunk(ports, session(b), { audio, mimeType: 'audio/ogg', language: 'auto' });
    ports.fixedClock.set(new Date('2026-07-01T00:00:00Z'));
    await transcribeChunk(ports, session(a), { audio, mimeType: 'audio/ogg', language: 'auto' });
    const audit = ports.db.audit.filter((e) => e.action === 'transcribe');
    expect(audit[0]?.meta).toEqual({ seconds: 6, mode: 'proxy' });
  });

  it('rejects oversize chunks and reports provider failures content-free', async () => {
    await expect(
      transcribeChunk(ports, session(a), {
        audio: new Uint8Array(4 * 1024 * 1024 + 1),
        mimeType: 'audio/ogg',
        language: 'auto',
      }),
    ).rejects.toMatchObject({ code: 'invalid' });
    const failing: TranscriptionProvider = {
      ...ports.mockTranscription,
      id: 'mock',
      capabilities: ports.mockTranscription.capabilities,
      healthCheck: ports.mockTranscription.healthCheck,
      mintClientToken: () => ports.mockTranscription.mintClientToken(),
      transcribe: async () => {
        throw new Error(SECRET);
      },
    };
    const p = { ...ports, transcription: failing };
    const err = await transcribeChunk(p, session(a), {
      audio: new Uint8Array(10),
      mimeType: 'audio/ogg',
      language: 'auto',
    }).catch((e) => e);
    expect(err).toBeInstanceOf(DomainError);
    expect(err.code).toBe('provider_error');
    expect(JSON.stringify({ m: err.message, d: err.details })).not.toContain('Moshe');
  });

  it('charges direct-mode tokens up front', async () => {
    const t = await mintTranscriptionToken(ports, session(a), { durationSec: 100 });
    expect(t.usage.usedSeconds).toBe(100);
    await expect(
      mintTranscriptionToken(ports, session(a), { durationSec: 30 }),
    ).rejects.toMatchObject({ code: 'quota_exceeded' });
    const off = { ...ports, transcription: null };
    await expect(
      mintTranscriptionToken(off, session(a), { durationSec: 1 }),
    ).rejects.toMatchObject({ code: 'unsupported' });
  });
});

describe('ask', () => {
  it('requires consent, streams, and allows the daily limit', async () => {
    const input = { question: 'Who called?', transcriptText: SECRET, consent: true };
    await expect(askAboutCall(ports, session(a), { ...input, consent: false })).rejects.toMatchObject(
      { code: 'invalid' },
    );
    for (let i = 0; i < 3; i++) {
      expect(await collect(await askAboutCall(ports, session(a), input))).toContain('mock answer');
    }
    await expect(askAboutCall(ports, session(a), input)).rejects.toMatchObject({
      code: 'rate_limited',
      details: { quota: 'asks', retryAfterSec: 12 * 3600 },
    });
    await askAboutCall(ports, session(b), input);
    expect(JSON.stringify(ports.db.audit)).not.toContain('Moshe');
    await expect(askAboutCall({ ...ports, llm: null }, session(a), input)).rejects.toMatchObject({
      code: 'unsupported',
    });
  });
});

describe('inbox (spec 6.7)', () => {
  async function inboxKeys() {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
    await ports.keyring.putUserKeys({
      userId: a,
      inboxPublicKey: spki,
      inboxPrivateKeyCt: new Uint8Array(10),
      keyVersion: 1,
    });
    return pair;
  }

  it('seals the payload so only the inbox key opens it, and stores no plaintext', async () => {
    const pair = await inboxKeys();
    const audio = new TextEncoder().encode('RIFFfakeaudio');
    const { id } = await uploadToInbox(
      ports,
      session(a),
      {
        transcriptText: SECRET,
        audio: { bytes: audio.slice(), mimeType: 'audio/wav' },
        phone: '+972541234567',
        startedAt: null,
        direction: 'in',
        contactName: 'Moshe',
      },
      sealToInbox,
    );
    const item = ports.db.inbox.get(id)!;
    expect(item.ephemeralPublicKey.length).toBe(65);
    const dump = Buffer.from(JSON.stringify([...ports.db.inbox.values()], (_k, v) =>
      v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v,
    ));
    expect(dump.includes('Moshe')).toBe(false);
    expect(dump.includes('0541234567')).toBe(false);

    const plain = await openInboxSeal(pair.privateKey, item.ephemeralPublicKey, item.payloadCt!, inboxAad(a));
    const decoded = decodeInboxPayload(plain);
    expect(decoded.transcriptText).toBe(SECRET);
    expect(decoded.audio?.bytes).toEqual(audio);
    expect(decoded.contactName).toBe('Moshe');
    await expect(
      openInboxSeal(pair.privateKey, item.ephemeralPublicKey, item.payloadCt!, inboxAad(b)),
    ).rejects.toThrow();

    expect((await listInbox(ports, session(a))).map((i) => i.id)).toEqual([id]);
    expect(await listInbox(ports, session(b))).toEqual([]);
    await expect(deleteInboxItem(ports, session(b), id)).rejects.toMatchObject({ code: 'not_found' });
    await deleteInboxItem(ports, session(a), id);
    expect(await ports.inbox.count(a)).toBe(0);
  });

  it('puts large payloads in blob storage and needs inbox keys', async () => {
    await expect(
      uploadToInbox(
        ports,
        session(b),
        { transcriptText: 'x', audio: null, phone: null, startedAt: null, direction: null, contactName: null },
        sealToInbox,
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    await inboxKeys();
    const { id } = await uploadToInbox(
      ports,
      session(a),
      {
        transcriptText: 'w'.repeat(300_000),
        audio: null,
        phone: null,
        startedAt: null,
        direction: null,
        contactName: null,
      },
      sealToInbox,
    );
    const item = ports.db.inbox.get(id)!;
    expect(item.payloadCt).toBeNull();
    expect(await ports.blobs.exists(item.blobKey!)).toBe(true);
    expect((await listInbox(ports, session(a)))[0]?.payloadUrl).toMatch(/^mock:\/\//);
    await deleteInboxItem(ports, session(a), id);
    expect(await ports.blobs.exists(item.blobKey!)).toBe(false);
  });
});
