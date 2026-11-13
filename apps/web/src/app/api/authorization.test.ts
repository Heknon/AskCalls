import type { RouteAuth } from '@askcalls/api-contract';
import { CreateCallBody } from '@askcalls/api-contract/routes/calls';
import { toB64 } from '@askcalls/api-contract/wire';
import type { ApiScope } from '@askcalls/domain';
import { createCall, presignRecordingUpload, updateCall } from '@askcalls/domain/use-cases/calls';
import { joinDeviceLink, startDeviceLink } from '@askcalls/domain/use-cases/devices';
import { uploadToInbox } from '@askcalls/domain/use-cases/inbox';
import { addKeyringEntry } from '@askcalls/domain/use-cases/keyring';
import { createApiToken } from '@askcalls/domain/use-cases/tokens';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sealToInbox } from '../../server/crypto/inbox-seal';
import { newCall, rand, session } from '../../server/testing/fixtures';
import {
  type Credential,
  sessionCookie,
  startTestApp,
  type TestApp,
} from '../../server/testing/http';

/**
 * Authorization on every route (spec 13): unauthenticated → 401, wrong scope → 403, another
 * user never reads or changes the owner's rows, and every response is `no-store`.
 */

interface Fixture {
  a: string;
  b: string;
  callId: string;
  keyringId: string;
  inboxId: string;
  tokenId: string;
  linkId: string;
}

interface Case {
  name: string;
  method: string;
  path: (f: Fixture) => string;
  auth: Exclude<RouteAuth, 'link' | 'public' | 'cron'>;
  json?: (f: Fixture) => unknown;
  raw?: { bytes: Uint8Array; contentType: string };
  /** `not_found`: another user gets 404. `own`: another user acts on their own (empty) data. */
  cross: 'not_found' | 'own';
}

const CASES: Case[] = [
  { name: 'GET /api/me', method: 'GET', path: () => '/api/me', auth: 'session', cross: 'own' },
  {
    name: 'DELETE /api/account',
    method: 'DELETE',
    path: () => '/api/account',
    auth: 'session',
    json: () => ({ confirm: 'delete my account' }),
    cross: 'own',
  },
  {
    name: 'GET /api/keyring',
    method: 'GET',
    path: () => '/api/keyring',
    auth: 'keys',
    cross: 'own',
  },
  {
    name: 'POST /api/keyring',
    method: 'POST',
    path: () => '/api/keyring',
    auth: 'session',
    json: () => ({
      type: 'entry',
      kind: 'passphrase',
      label: 'phrase',
      credentialId: null,
      wrappedRootKey: toB64(rand(60)),
      kdfParams: {},
    }),
    cross: 'own',
  },
  {
    name: 'GET /api/keyring/:id',
    method: 'GET',
    path: (f) => `/api/keyring/${f.keyringId}`,
    auth: 'keys',
    cross: 'not_found',
  },
  {
    name: 'DELETE /api/keyring/:id',
    method: 'DELETE',
    path: (f) => `/api/keyring/${f.keyringId}`,
    auth: 'session',
    cross: 'not_found',
  },
  {
    name: 'POST /api/devices/link',
    method: 'POST',
    path: () => '/api/devices/link',
    auth: 'session',
    cross: 'own',
  },
  {
    name: 'GET /api/devices/link/:session',
    method: 'GET',
    path: (f) => `/api/devices/link/${f.linkId}`,
    auth: 'session',
    cross: 'not_found',
  },
  {
    name: 'POST /api/devices/link/:session confirm',
    method: 'POST',
    path: (f) => `/api/devices/link/${f.linkId}`,
    auth: 'session',
    json: () => ({ action: 'confirm', encryptedRootKey: toB64(rand(100)) }),
    cross: 'not_found',
  },
  {
    name: 'POST /api/transcribe',
    method: 'POST',
    path: () => '/api/transcribe?language=he',
    auth: 'write',
    raw: { bytes: new Uint8Array(32_000), contentType: 'audio/ogg' },
    cross: 'own',
  },
  {
    name: 'POST /api/transcribe/token',
    method: 'POST',
    path: () => '/api/transcribe/token',
    auth: 'write',
    json: () => ({ durationSec: 10 }),
    cross: 'own',
  },
  {
    name: 'POST /api/telemetry/consent',
    method: 'POST',
    path: () => '/api/telemetry/consent',
    auth: 'session',
    json: () => ({ productEvents: true, errorReports: true }),
    cross: 'own',
  },
  {
    name: 'POST /api/telemetry/events',
    method: 'POST',
    path: () => '/api/telemetry/events',
    auth: 'session',
    json: () => ({ name: 'first_search_with_result' }),
    cross: 'own',
  },
  {
    name: 'POST /api/telemetry/errors',
    method: 'POST',
    path: () => '/api/telemetry/errors',
    auth: 'session',
    json: () => ({ errorName: 'TypeError' }),
    cross: 'own',
  },
  {
    name: 'POST /api/ask',
    method: 'POST',
    path: () => '/api/ask',
    auth: 'ask',
    json: () => ({ question: 'Who?', transcriptText: 'hello', consent: true }),
    cross: 'own',
  },
  {
    name: 'POST /api/calls',
    method: 'POST',
    path: () => '/api/calls',
    auth: 'write',
    json: () => z.encode(CreateCallBody, newCall()),
    cross: 'own',
  },
  { name: 'GET /api/calls', method: 'GET', path: () => '/api/calls', auth: 'read', cross: 'own' },
  {
    name: 'GET /api/calls/:id',
    method: 'GET',
    path: (f) => `/api/calls/${f.callId}`,
    auth: 'read',
    cross: 'not_found',
  },
  {
    name: 'PATCH /api/calls/:id',
    method: 'PATCH',
    path: (f) => `/api/calls/${f.callId}`,
    auth: 'write',
    json: () => ({ tagToks: ['7'] }),
    cross: 'not_found',
  },
  {
    name: 'DELETE /api/calls/:id',
    method: 'DELETE',
    path: (f) => `/api/calls/${f.callId}`,
    auth: 'write',
    cross: 'not_found',
  },
  {
    name: 'POST /api/calls/:id/recording-upload',
    method: 'POST',
    path: (f) => `/api/calls/${f.callId}/recording-upload`,
    auth: 'write',
    json: () => ({ bytes: 10 }),
    cross: 'not_found',
  },
  {
    name: 'GET /api/calls/:id/recording',
    method: 'GET',
    path: (f) => `/api/calls/${f.callId}/recording`,
    auth: 'read',
    cross: 'not_found',
  },
  {
    name: 'POST /api/search',
    method: 'POST',
    path: () => '/api/search',
    auth: 'read',
    json: () => ({ keywordGroups: [], limit: 10 }),
    cross: 'own',
  },
  { name: 'GET /api/vocab', method: 'GET', path: () => '/api/vocab', auth: 'read', cross: 'own' },
  {
    name: 'POST /api/vocab',
    method: 'POST',
    path: () => '/api/vocab',
    auth: 'write',
    json: () => ({ op: 'append', ct: toB64(rand(20)) }),
    cross: 'own',
  },
  {
    name: 'GET /api/userdata/:kind',
    method: 'GET',
    path: () => '/api/userdata/tags',
    auth: 'read',
    cross: 'own',
  },
  {
    name: 'PUT /api/userdata/:kind',
    method: 'PUT',
    path: () => '/api/userdata/tags',
    auth: 'write',
    json: () => ({ ct: toB64(rand(20)), expectedVersion: 1 }),
    cross: 'own',
  },
  {
    name: 'POST /api/inbox',
    method: 'POST',
    path: () => '/api/inbox',
    auth: 'write',
    json: () => ({ transcriptText: 'hello there' }),
    cross: 'own',
  },
  { name: 'GET /api/inbox', method: 'GET', path: () => '/api/inbox', auth: 'read', cross: 'own' },
  {
    name: 'DELETE /api/inbox/:id',
    method: 'DELETE',
    path: (f) => `/api/inbox/${f.inboxId}`,
    auth: 'write',
    cross: 'not_found',
  },
  {
    name: 'GET /api/tokens',
    method: 'GET',
    path: () => '/api/tokens',
    auth: 'session',
    cross: 'own',
  },
  {
    name: 'POST /api/tokens',
    method: 'POST',
    path: () => '/api/tokens',
    auth: 'session',
    json: () => ({ name: 'cli', scopes: ['read'], expiresInDays: 7 }),
    cross: 'own',
  },
  {
    name: 'DELETE /api/tokens',
    method: 'DELETE',
    path: (f) => `/api/tokens?id=${f.tokenId}`,
    auth: 'session',
    cross: 'not_found',
  },
  {
    name: 'GET /api/audit',
    method: 'GET',
    path: () => '/api/audit',
    auth: 'session',
    cross: 'own',
  },
  {
    name: 'GET /api/settings/retention',
    method: 'GET',
    path: () => '/api/settings/retention',
    auth: 'session',
    cross: 'own',
  },
  {
    name: 'PUT /api/settings/retention',
    method: 'PUT',
    path: () => '/api/settings/retention',
    auth: 'session',
    json: () => ({ retentionDays: 30 }),
    cross: 'own',
  },
];

const ALL_SCOPES: ApiScope[] = ['read', 'write', 'ask', 'keys'];

let app: TestApp;
let f: Fixture;

async function setupFixture(): Promise<Fixture> {
  const { ports } = app;
  const a = (await ports.users.create({ email: 'a@example.test' })).id;
  const b = (await ports.users.create({ email: 'b@example.test' })).id;
  const call = newCall();
  await createCall(ports, session(a), call);
  const up = await presignRecordingUpload(ports, session(a), call.id, { bytes: 10 });
  await ports.blobs.put(up.objectKey, rand(10));
  await updateCall(ports, session(a), call.id, {
    recording: { bucketRef: null, objectKey: up.objectKey, bytes: 10 },
  });
  const entry = await addKeyringEntry(ports, session(a), {
    kind: 'recovery',
    label: 'recovery',
    credentialId: null,
    wrappedRootKey: rand(60),
    kdfParams: {},
  });
  await addKeyringEntry(ports, session(a), {
    kind: 'passkey',
    label: 'pk',
    credentialId: 'cred',
    wrappedRootKey: rand(60),
    kdfParams: {},
  });
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  await ports.keyring.putUserKeys({
    userId: a,
    inboxPublicKey: new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)),
    inboxPrivateKeyCt: rand(80),
    keyVersion: 1,
  });
  const item = await uploadToInbox(
    ports,
    session(a),
    {
      transcriptText: 'x',
      audio: null,
      phone: null,
      startedAt: null,
      direction: null,
      contactName: null,
    },
    sealToInbox,
  );
  await ports.userData.put(a, 'tags', rand(10), 0);
  const token = await createApiToken(ports, session(a), {
    name: 'keep',
    scopes: ['read'],
    expiresInDays: null,
  });
  const linkStart = await startDeviceLink(ports, session(a));
  await joinDeviceLink(ports, linkStart.sessionId, {
    secret: linkStart.secret,
    devicePublicKey: rand(65),
    deviceLabel: 'agent',
    signingPublicKey: rand(91),
  });
  return {
    a,
    b,
    callId: call.id,
    keyringId: entry.id,
    inboxId: item.id,
    tokenId: token.record.id,
    linkId: linkStart.sessionId,
  };
}

async function tokenFor(userId: string, scopes: ApiScope[]): Promise<Credential> {
  const { token } = await createApiToken(app.ports, session(userId), {
    name: `t-${scopes.join('-')}`,
    scopes,
    expiresInDays: null,
  });
  return { token };
}

/** The owner's rows are exactly as the fixture left them. */
async function expectOwnerIntact() {
  const { ports } = app;
  expect(await ports.calls.get(f.a, f.callId)).not.toBeNull();
  expect(await ports.keyring.get(f.a, f.keyringId)).not.toBeNull();
  expect(await ports.inbox.get(f.a, f.inboxId)).not.toBeNull();
  expect((await ports.userData.get(f.a, 'tags'))?.version).toBe(1);
  const tok = (await ports.apiTokens.list(f.a)).find((t) => t.id === f.tokenId);
  expect(tok?.revokedAt).toBeNull();
  expect((await ports.keyring.getLinkSession(f.linkId))?.state).toBe('waiting_for_confirmation');
  expect(await ports.users.findById(f.a)).not.toBeNull();
}

beforeEach(async () => {
  app = startTestApp();
  f = await setupFixture();
});
afterEach(() => app.close());

describe.each(CASES)('$name', (c) => {
  const send = (as: Credential) =>
    app.req(c.method, c.path(f), {
      as,
      ...(c.json && { json: c.json(f) }),
      ...(c.raw && { raw: c.raw }),
    });

  it('needs authentication', async () => {
    const res = await send(null);
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await res.json()).error.code).toBe('unauthorized');
    await expectOwnerIntact();
  });

  it('rejects an invalid bearer token', async () => {
    const res = await send({ token: `ac_${'x'.repeat(43)}` });
    expect(res.status).toBe(401);
  });

  it('enforces the token scope', async () => {
    const scopes = c.auth === 'session' ? ALL_SCOPES : ALL_SCOPES.filter((s) => s !== c.auth);
    const res = await send(await tokenFor(f.a, scopes));
    expect(res.status).toBe(403);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect((await res.json()).error.code).toBe('forbidden');
    await expectOwnerIntact();
  });

  it("never exposes or changes another user's rows", async () => {
    const res = await send({ cookie: await sessionCookie(f.b) });
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    if (c.cross === 'not_found') expect(res.status).toBe(404);
    for (const id of [f.callId, f.keyringId, f.inboxId, f.tokenId, f.linkId, 'a@example.test']) {
      expect(text).not.toContain(id);
    }
    await expectOwnerIntact();
    if (c.auth !== 'session') {
      const tokenRes = await send(await tokenFor(f.b, ALL_SCOPES));
      if (c.cross === 'not_found') expect(tokenRes.status).toBe(404);
      await expectOwnerIntact();
    }
  });

  it('serves the owner with a session', async () => {
    const res = await send({ cookie: await sessionCookie(f.a) });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.status, await res.clone().text()).toBe(200);
  });

  it.skipIf(c.auth === 'session')('serves the owner with a scoped token', async () => {
    const res = await send(await tokenFor(f.a, [c.auth as ApiScope]));
    expect(res.status, await res.clone().text()).toBe(200);
  });
});

describe('sessions', () => {
  it('rejects a session for a deleted user and a session signed with another secret', async () => {
    const cookie = await sessionCookie(f.a);
    await app.ports.users.deleteHard(f.a);
    expect((await app.req('GET', '/api/me', { as: { cookie } })).status).toBe(401);
    const forged = await sessionCookie(f.b, 'another-secret-0123456789abcdef0123');
    expect((await app.req('GET', '/api/me', { as: { cookie: forged } })).status).toBe(401);
  });

  it('expires the session cookie on account deletion', async () => {
    const res = await app.req('DELETE', '/api/account', {
      as: { cookie: await sessionCookie(f.a) },
      json: { confirm: 'delete my account' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('authjs.session-token=; Path=/; Max-Age=0');
    expect(await app.ports.users.findById(f.a)).toBeNull();
    expect(await app.ports.users.findById(f.b)).not.toBeNull();
  });
});
