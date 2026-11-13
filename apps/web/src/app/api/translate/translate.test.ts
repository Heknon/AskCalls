import { translate } from '@askcalls/api-contract/routes/providers';
import { createApiToken } from '@askcalls/domain/use-cases/tokens';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { session } from '../../../server/testing/fixtures';
import {
  type Credential,
  sessionCookie,
  startTestApp,
  type TestApp,
} from '../../../server/testing/http';

let app: TestApp;
afterEach(() => {
  app?.close();
  vi.restoreAllMocks();
});

const SECRET = 'Shoshana ordered 17 crates, phone 0541234567';

async function user(email = 'a@example.test') {
  const u = await app.ports.users.create({ email });
  return { id: u.id, as: { cookie: await sessionCookie(u.id) } as Credential };
}

const body = (segments: string[], target: 'en' | 'he' = 'he') => ({
  segments,
  source: target === 'he' ? 'en' : 'he',
  target,
});

describe('POST /api/translate', () => {
  it('returns one aligned segment per input with provider, model and usage', async () => {
    app = startTestApp();
    const a = await user();
    const res = await app
      .client(a.as)
      .request(translate, { body: body(['Hello, what is the price?', '', 'Thursday morning']) });
    expect(res.segments).toEqual(['שלום, what is the מחיר?', '', 'חמישי בוקר']);
    expect(res.provider).toBe('mock');
    expect(res.model).toBe('mock-1');
    expect(res.usage).toEqual({ usedChars: 41, limitChars: 2_000_000 });
    expect(app.ports.mockLlm.translated).toEqual([{ segments: 3, target: 'he' }]);
  });

  it('is no-store, writes a content-free audit event and logs nothing', async () => {
    app = startTestApp();
    const a = await user();
    const logs = [
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
      vi.spyOn(console, 'debug'),
    ];
    const res = await app.req('POST', '/api/translate', { as: a.as, json: body([SECRET]) });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    for (const spy of logs) expect(spy).not.toHaveBeenCalled();
    const audit = app.ports.db.audit.filter((e) => e.action === 'translate');
    expect(audit).toHaveLength(1);
    expect(audit[0]!.meta).toEqual({
      provider: 'mock',
      segments: 1,
      chars: SECRET.length,
      target: 'he',
    });
    const stored = JSON.stringify(
      [...app.ports.db.audit, ...app.ports.db.calls.values(), ...app.ports.db.userData.values()],
      (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v),
    );
    expect(stored).not.toContain('Shoshana');
    expect(stored).not.toContain('0541234567');
    expect(app.ports.recordedTelemetry.events).toEqual([]);
  });

  it('counts characters against the monthly quota and refunds failures', async () => {
    app = startTestApp({ limits: { translationCharsPerMonth: 30 } });
    const a = await user();
    const ok = await app.req('POST', '/api/translate', {
      as: a.as,
      json: body(['x'.repeat(20)]),
    });
    expect(ok.status).toBe(200);
    const over = await app.req('POST', '/api/translate', {
      as: a.as,
      json: body(['x'.repeat(11)]),
    });
    expect(over.status).toBe(403);
    const err = (await over.json()).error;
    expect(err.code).toBe('quota_exceeded');
    expect(err.details).toMatchObject({ quota: 'translation_chars', limit: 30 });

    app.ports.mockLlm.translate = async () => {
      throw new Error(SECRET);
    };
    const failed = await app.req('POST', '/api/translate', {
      as: a.as,
      json: body(['y'.repeat(10)]),
    });
    expect(failed.status).toBe(502);
    expect(await failed.text()).not.toContain('Shoshana');
    const me = await app.req('GET', '/api/me', { as: a.as });
    const json = await me.json();
    expect(json.usage.translationCharsThisMonth).toBe(20);
    expect(json.limits.translationCharsPerMonth).toBe(30);
    expect(json.features.translation).toEqual({ enabled: true });
  });

  it('refuses a provider reply that does not match the segments', async () => {
    app = startTestApp();
    const a = await user();
    app.ports.mockLlm.translate = async () => ['only one'];
    const res = await app.req('POST', '/api/translate', { as: a.as, json: body(['a', 'b']) });
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('provider_error');
  });

  it('is 404 unsupported when the LLM or translation is off', async () => {
    for (const opts of [{ llm: false }, { translation: false }]) {
      app = startTestApp(opts);
      const a = await user();
      const res = await app.req('POST', '/api/translate', { as: a.as, json: body(['hello']) });
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect((await res.json()).error.code).toBe('unsupported');
      const me = await (await app.req('GET', '/api/me', { as: a.as })).json();
      expect(me.features.translation).toEqual({ enabled: false });
      app.close();
    }
  });

  it('validates batch size, languages and needs the write scope', async () => {
    app = startTestApp();
    const a = await user();
    const bad = [
      { segments: [], source: 'en', target: 'he' },
      { segments: Array(201).fill('a'), source: 'en', target: 'he' },
      { segments: ['a'.repeat(4_001)], source: 'en', target: 'he' },
      { segments: Array(7).fill('a'.repeat(3_500)), source: 'en', target: 'he' },
      { segments: ['a'], source: 'en', target: 'fr' },
      { segments: ['a'], source: 'he', target: 'he' },
      { segments: ['a'], source: 'eng', target: 'he' },
    ];
    for (const json of bad) {
      const res = await app.req('POST', '/api/translate', { as: a.as, json });
      expect(res.status, JSON.stringify(json).slice(0, 60)).toBe(400);
    }
    const read = await createApiToken(app.ports, session(a.id), {
      name: 'r',
      scopes: ['read', 'ask'],
      expiresInDays: null,
    });
    const forbidden = await app.req('POST', '/api/translate', {
      as: { token: read.token },
      json: body(['hello']),
    });
    expect(forbidden.status).toBe(403);
    const write = await createApiToken(app.ports, session(a.id), {
      name: 'w',
      scopes: ['write'],
      expiresInDays: null,
    });
    const allowed = await app.req('POST', '/api/translate', {
      as: { token: write.token },
      json: body(['hello']),
    });
    expect(allowed.status).toBe(200);
  });

  it('rate-limits bursts per user', async () => {
    app = startTestApp();
    const a = await user();
    for (let i = 0; i < 60; i++) {
      expect(
        (await app.req('POST', '/api/translate', { as: a.as, json: body(['hi']) })).status,
      ).toBe(200);
    }
    const limited = await app.req('POST', '/api/translate', { as: a.as, json: body(['hi']) });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('cache-control')).toBe('no-store');
  });
});
