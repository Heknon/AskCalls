import { ApiError } from '@askcalls/api-contract';
import { createCall, getCall } from '@askcalls/api-contract/routes/calls';
import { confirmLink, fetchLink, joinLink, startLink } from '@askcalls/api-contract/routes/devices';
import { ask } from '@askcalls/api-contract/routes/providers';
import { createToken } from '@askcalls/api-contract/routes/tokens';
import { toB64 } from '@askcalls/api-contract/wire';
import { createCall as createCallUseCase } from '@askcalls/domain/use-cases/calls';
import { createApiToken } from '@askcalls/domain/use-cases/tokens';
import { afterEach, describe, expect, it } from 'vitest';
import { newCall, rand, session } from '../../server/testing/fixtures';
import {
  CRON_SECRET,
  type Credential,
  sessionCookie,
  startTestApp,
  type TestApp,
} from '../../server/testing/http';

let app: TestApp;
afterEach(() => app?.close());

async function user(email = 'a@example.test') {
  const u = await app.ports.users.create({ email });
  return { id: u.id, as: { cookie: await sessionCookie(u.id) } as Credential };
}

async function token(userId: string, scopes: Array<'read' | 'write' | 'ask' | 'keys'>) {
  return (
    await createApiToken(app.ports, session(userId), { name: 'agent', scopes, expiresInDays: null })
  ).token;
}

describe('typed client round trip', () => {
  it('encodes bytes, tokens and vectors and decodes them back', async () => {
    app = startTestApp();
    const a = await user();
    const client = app.client(a.as);
    const input = newCall({ contactTok: -9223372036854775808n, tagToks: [42n] });
    expect(await client.request(createCall, { body: input })).toEqual({ id: input.id });
    const got = await client.request(getCall, { params: { id: input.id } });
    expect(got.transcriptCt).toEqual(input.transcriptCt);
    expect(got.contactTok).toBe(-9223372036854775808n);
    expect(got.tagToks).toEqual([42n]);
    expect(got.createdAt).toBeInstanceOf(Date);
    expect(app.ports.db.chunks.get(input.id)?.[0]?.embedding).toEqual(input.chunks[0]!.embedding);

    const dup = await client
      .request(createCall, { body: newCall({ contentTok: input.contentTok }) })
      .catch((e) => e);
    expect(dup).toBeInstanceOf(ApiError);
    expect(dup).toMatchObject({
      status: 409,
      code: 'duplicate',
      details: { existingId: input.id },
    });
  });
});

describe('quotas', () => {
  it('free-tier call limit', async () => {
    app = startTestApp({ limits: { maxCalls: 1 } });
    const a = await user();
    const client = app.client(a.as);
    await client.request(createCall, { body: newCall() });
    const err = await client.request(createCall, { body: newCall() }).catch((e) => e);
    expect(err).toMatchObject({ status: 403, code: 'quota_exceeded', details: { quota: 'calls' } });
  });

  it('recording bytes', async () => {
    app = startTestApp({ limits: { recordingBytes: 100 } });
    const a = await user();
    const call = newCall();
    await createCallUseCase(app.ports, session(a.id), call);
    const over = await app.req('POST', `/api/calls/${call.id}/recording-upload`, {
      as: a.as,
      json: { bytes: 101 },
    });
    expect(over.status).toBe(403);
    expect((await over.json()).error.details.quota).toBe('recording_bytes');
    const ok = await app.req('POST', `/api/calls/${call.id}/recording-upload`, {
      as: a.as,
      json: { bytes: 100 },
    });
    const { objectKey } = await ok.json();
    await app.ports.blobs.put(objectKey, rand(100));
    const confirm = await app.req('PATCH', `/api/calls/${call.id}`, {
      as: a.as,
      json: { recording: { bucketRef: null, objectKey, bytes: 100 } },
    });
    expect(confirm.status).toBe(200);
    const dl = await app.req('GET', `/api/calls/${call.id}/recording`, { as: a.as });
    expect((await dl.json()).location).toBe('instance');
  });

  it('five personal access tokens', async () => {
    app = startTestApp();
    const a = await user();
    const client = app.client(a.as);
    for (let i = 0; i < 5; i++) {
      const t = await client.request(createToken, {
        body: { name: `t${i}`, scopes: ['read'], expiresInDays: null },
      });
      expect(t.token).toMatch(/^ac_/);
    }
    const err = await client
      .request(createToken, { body: { name: 'x', scopes: ['read'], expiresInDays: null } })
      .catch((e) => e);
    expect(err).toMatchObject({ status: 403, code: 'quota_exceeded' });
  });

  it('60 ciphertext fetches per token per hour', async () => {
    app = startTestApp();
    const a = await user();
    const call = newCall();
    await createCallUseCase(app.ports, session(a.id), call);
    const as = { token: await token(a.id, ['read']) };
    for (let i = 0; i < 60; i++) {
      expect((await app.req('GET', `/api/calls/${call.id}`, { as })).status).toBe(200);
    }
    const over = await app.req('GET', `/api/calls/${call.id}`, { as });
    expect(over.status).toBe(429);
    expect(over.headers.get('retry-after')).toBe('3600');
    // Other tokens and sessions are unaffected.
    const other = { token: await token(a.id, ['read']) };
    expect((await app.req('GET', `/api/calls/${call.id}`, { as: other })).status).toBe(200);
    expect((await app.req('GET', `/api/calls/${call.id}`, { as: a.as })).status).toBe(200);
    app.ports.fixedClock.advance(3_600_001);
    expect((await app.req('GET', `/api/calls/${call.id}`, { as })).status).toBe(200);
  });

  it('50 asks per day', async () => {
    app = startTestApp();
    const a = await user();
    const body = { question: 'Who?', transcriptText: 'hello', consent: true as const };
    const client = app.client(a.as);
    let answer = '';
    for await (const chunk of client.stream(ask, { body })) answer += chunk;
    expect(answer).toBe('This is a mock answer based on the call transcript.');
    for (let i = 1; i < 50; i++) {
      if (i % 20 === 0) app.ports.fixedClock.advance(61_000);
      expect((await app.req('POST', '/api/ask', { as: a.as, json: body })).status).toBe(200);
    }
    app.ports.fixedClock.advance(61_000);
    const over = await app.req('POST', '/api/ask', { as: a.as, json: body });
    expect(over.status).toBe(429);
    expect((await over.json()).error.details.quota).toBe('asks');
    expect(Number(over.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('ask needs consent and is 404 when the LLM is off', async () => {
    app = startTestApp({ llm: false });
    const a = await user();
    const noConsent = await app.req('POST', '/api/ask', {
      as: a.as,
      json: { question: 'q', transcriptText: 't', consent: false },
    });
    expect(noConsent.status).toBe(400);
    const off = await app.req('POST', '/api/ask', {
      as: a.as,
      json: { question: 'q', transcriptText: 't', consent: true },
    });
    expect(off.status).toBe(404);
    expect((await off.json()).error.code).toBe('unsupported');
  });

  it('transcription minutes per month', async () => {
    app = startTestApp({ limits: { transcriptionMinutesPerMonth: 1 } });
    const a = await user();
    const raw = { bytes: new Uint8Array(16_000 * 30), contentType: 'audio/ogg' };
    const first = await app.req('POST', '/api/transcribe', { as: a.as, raw });
    expect(first.status).toBe(200);
    expect((await first.json()).usage).toEqual({ usedSeconds: 30, limitSeconds: 60 });
    expect((await app.req('POST', '/api/transcribe', { as: a.as, raw })).status).toBe(200);
    const over = await app.req('POST', '/api/transcribe', { as: a.as, raw });
    expect(over.status).toBe(403);
    expect((await over.json()).error.details.quota).toBe('transcription_minutes');
    const tooBig = await app.req('POST', '/api/transcribe', {
      as: a.as,
      raw: { bytes: new Uint8Array(4 * 1024 * 1024 + 1), contentType: 'audio/ogg' },
    });
    expect(tooBig.status).toBe(413);
    const wrongType = await app.req('POST', '/api/transcribe', {
      as: a.as,
      raw: { bytes: new Uint8Array(10), contentType: 'text/plain' },
    });
    expect(wrongType.status).toBe(415);
  });

  it('transcription is 404 when off', async () => {
    app = startTestApp({ transcription: false });
    const a = await user();
    const res = await app.req('POST', '/api/transcribe', {
      as: a.as,
      raw: { bytes: new Uint8Array(10), contentType: 'audio/ogg' },
    });
    expect(res.status).toBe(404);
  });
});

describe('rate limits', () => {
  it('limits each user and returns Retry-After', async () => {
    app = startTestApp();
    const a = await user();
    const b = await user('b@example.test');
    for (let i = 0; i < 600; i++) await app.req('GET', '/api/me', { as: a.as });
    const limited = await app.req('GET', '/api/me', { as: a.as });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('cache-control')).toBe('no-store');
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await app.req('GET', '/api/me', { as: b.as })).status).toBe(200);
    app.ports.fixedClock.advance(60_001);
    expect((await app.req('GET', '/api/me', { as: a.as })).status).toBe(200);
  });

  it('limits each token separately', async () => {
    app = startTestApp();
    const a = await user();
    const t1 = { token: await token(a.id, ['read']) };
    const t2 = { token: await token(a.id, ['read']) };
    for (let i = 0; i < 300; i++) await app.req('GET', '/api/calls', { as: t1 });
    expect((await app.req('GET', '/api/calls', { as: t1 })).status).toBe(429);
    expect((await app.req('GET', '/api/calls', { as: t2 })).status).toBe(200);
  });

  it('applies per-route limits (token creation)', async () => {
    app = startTestApp();
    const a = await user();
    for (let i = 0; i < 10; i++) {
      await app.req('POST', '/api/tokens', {
        as: a.as,
        json: { name: 'x', scopes: ['read'], expiresInDays: 1 },
      });
    }
    const res = await app.req('POST', '/api/tokens', {
      as: a.as,
      json: { name: 'x', scopes: ['read'], expiresInDays: 1 },
    });
    expect(res.status).toBe(429);
  });
});

describe('cron/retention', () => {
  it('requires the cron secret', async () => {
    app = startTestApp();
    const a = await user();
    expect((await app.req('GET', '/api/cron/retention')).status).toBe(401);
    expect((await app.req('GET', '/api/cron/retention', { as: a.as })).status).toBe(401);
    expect(
      (await app.req('GET', '/api/cron/retention', { headers: { authorization: 'Bearer nope' } }))
        .status,
    ).toBe(401);
    const ok = await app.req('GET', '/api/cron/retention', {
      headers: { authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(await ok.json()).toEqual({
      usersProcessed: 0,
      callsDeleted: 0,
      inboxExpired: 0,
      linkSessionsExpired: 0,
    });
  });

  it('fails closed in production without a secret', async () => {
    app = startTestApp({ env: { NODE_ENV: 'production', CRON_SECRET: '' } });
    const res = await app.req('GET', '/api/cron/retention');
    expect(res.status).toBe(503);
  });

  it('runs without a secret in development', async () => {
    app = startTestApp({ env: { NODE_ENV: 'development', CRON_SECRET: '' } });
    expect((await app.req('GET', '/api/cron/retention')).status).toBe(200);
  });
});

describe('device link over HTTP', () => {
  it('joins with the secret, confirms with the session, fetches once', async () => {
    app = startTestApp();
    const a = await user();
    const b = await user('b@example.test');
    const start = await app.client(a.as).request(startLink, {});
    const anon = app.client(null);
    const devicePublicKey = rand(65);
    const wrong = await anon
      .request(joinLink, {
        params: { session: start.sessionId },
        body: {
          action: 'join',
          secret: 'not-the-secret-0123456789',
          devicePublicKey,
          deviceLabel: 'agent',
          signingPublicKey: rand(91),
        },
      })
      .catch((e) => e);
    expect(wrong).toMatchObject({ status: 404 });
    await anon.request(joinLink, {
      params: { session: start.sessionId },
      body: {
        action: 'join',
        secret: start.secret,
        devicePublicKey,
        deviceLabel: 'agent',
        signingPublicKey: rand(91),
      },
    });
    // A confirm needs the owner's session; the link secret alone is not enough.
    const anonConfirm = await app.req('POST', `/api/devices/link/${start.sessionId}`, {
      json: { action: 'confirm', encryptedRootKey: toB64(rand(10)) },
    });
    expect(anonConfirm.status).toBe(401);
    const bConfirm = await app.req('POST', `/api/devices/link/${start.sessionId}`, {
      as: b.as,
      json: { action: 'confirm', encryptedRootKey: toB64(rand(10)) },
    });
    expect(bConfirm.status).toBe(404);
    const payload = rand(120);
    const confirmed = await app.client(a.as).request(confirmLink, {
      params: { session: start.sessionId },
      body: { action: 'confirm', encryptedRootKey: payload },
    });
    const got = await anon.request(fetchLink, {
      params: { session: start.sessionId },
      body: { action: 'fetch', secret: start.secret },
    });
    expect(got).toEqual({
      state: 'completed',
      encryptedRootKey: payload,
      deviceKeyId: confirmed.deviceKeyId,
      keyringEntryId: confirmed.keyringEntryId,
    });
    const again = await app.req('POST', `/api/devices/link/${start.sessionId}`, {
      json: { action: 'fetch', secret: start.secret },
    });
    expect(again.status).toBe(404);
    const bad = await app.req('POST', `/api/devices/link/${start.sessionId}`, {
      json: { action: 'other' },
    });
    expect(bad.status).toBe(400);
  });
});

describe('request validation and errors', () => {
  it('rejects bad bodies with content-free messages', async () => {
    app = startTestApp();
    const a = await user();
    const secretWord = 'Shoshana';
    const bad = await app.req('POST', '/api/search', {
      as: a.as,
      json: { keywordGroups: [[secretWord]], limit: 10 },
    });
    expect(bad.status).toBe(400);
    expect(await bad.text()).not.toContain(secretWord);
    const notJson = await app.req('POST', '/api/search', {
      as: a.as,
      headers: { 'content-type': 'application/json' },
    });
    expect(notJson.status).toBe(400);
    const wrongType = await app.req('POST', '/api/search', {
      as: a.as,
      raw: { bytes: new Uint8Array(2), contentType: 'text/plain' },
    });
    expect(wrongType.status).toBe(415);
    const big = await app.req('POST', '/api/search', {
      as: a.as,
      json: { keywordGroups: [], limit: 10, pad: 'x'.repeat(600 * 1024) },
    });
    expect(big.status).toBe(413);
  });

  it('turns unexpected errors into a content-free 500', async () => {
    app = startTestApp();
    const a = await user();
    app.ports.calls.count = async () => {
      throw new Error('Shoshana 0541234567');
    };
    const res = await app.req('GET', '/api/me', { as: a.as });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain('Shoshana');
    expect(app.ports.recordedTelemetry.errors).toEqual([
      { code: 'internal', route: '/api/me', errorName: 'Error' },
    ]);
  });

  it('inbox POST stores ciphertext only', async () => {
    app = startTestApp();
    const a = await user();
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair;
    await app.ports.keyring.putUserKeys({
      userId: a.id,
      inboxPublicKey: new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)),
      inboxPrivateKeyCt: rand(10),
      keyVersion: 1,
    });
    const res = await app.req('POST', '/api/inbox', {
      as: { token: await token(a.id, ['write']) },
      json: { transcriptText: 'Shoshana wants 17 units', phone: '+972541234567' },
    });
    expect(res.status).toBe(200);
    expect((await res.json()).visibleInTransit).toBe(true);
    const dump = Buffer.from(
      JSON.stringify([...app.ports.db.inbox.values(), ...app.ports.db.audit], (_k, v) =>
        v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v,
      ),
    ).toString('latin1');
    expect(dump).not.toContain('Shoshana');
    expect(dump).not.toContain('541234567');
  });
});
