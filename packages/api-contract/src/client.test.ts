import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from './client';
import { listCalls, updateCall } from './routes/calls';
import { ask, transcribe } from './routes/providers';
import { createToken, revokeToken } from './routes/tokens';

/** A clock that moves only when the client sleeps. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

function recorder(respond: (url: string, init: RequestInit) => Response) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  return {
    calls,
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return respond(url, init);
    },
  };
}

describe('api client', () => {
  it('encodes query codecs and sends the bearer token', async () => {
    const r = recorder((url) =>
      Response.json(url.includes('tokens') ? { revoked: true } : { items: [], nextCursor: null }),
    );
    const client = createApiClient({ baseUrl: 'https://x.test/', fetch: r.fetch, token: 'ac_t' });
    await client.request(listCalls, {
      query: { day_from: 10, tag: [1n, -2n], starred: true, star_tok: 5n, limit: 20 },
    });
    const url = new URL(r.calls[0]!.url);
    expect(url.pathname).toBe('/api/calls');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      day_from: '10',
      tag: '1,-2',
      starred: 'true',
      star_tok: '5',
      limit: '20',
    });
    expect((r.calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer ac_t');
    await client.request(revokeToken, { query: { id: 'abc' } });
    expect(r.calls[1]!.url).toBe('https://x.test/api/tokens?id=abc');
  });

  it('encodes bodies and decodes responses', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const r = recorder((_u, init) => {
      const body = JSON.parse(String(init.body));
      expect(body).toEqual({ metaCt: 'AQID', tagToks: ['9223372036854775807'] });
      return Response.json({
        id: 'c1',
        status: 'ready',
        source: 'app',
        day: 1,
        durationBucket: 0,
        wrappedDek: 'AQ==',
        transcriptCt: 'Ag==',
        metaCt: 'AQID',
        contactTok: null,
        tagToks: ['9223372036854775807'],
        audioTok: null,
        contentTok: '-1',
        recording: null,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    });
    const client = createApiClient({ fetch: r.fetch });
    const call = await client.request(updateCall, {
      params: { id: 'c 1' },
      body: { metaCt: new Uint8Array([1, 2, 3]), tagToks: [9223372036854775807n] },
    });
    expect(r.calls[0]!.url).toBe('/api/calls/c%201');
    expect(call.metaCt).toEqual(new Uint8Array([1, 2, 3]));
    expect(call.contentTok).toBe(-1n);
    expect(call.createdAt).toEqual(now);
  });

  it('throws typed errors with Retry-After once the retries are spent', async () => {
    const clock = fakeClock();
    const r = recorder(() =>
      Response.json(
        { error: { code: 'rate_limited', message: 'too many requests' } },
        { status: 429, headers: { 'Retry-After': '30' } },
      ),
    );
    const err = await createApiClient({ fetch: r.fetch, ...clock })
      .request(listCalls, {})
      .catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: 'rate_limited', retryAfterSec: 30 });
    expect(r.calls).toHaveLength(4);
    const html = recorder(() => new Response('<html>', { status: 502 }));
    expect(
      await createApiClient({ fetch: html.fetch, ...clock })
        .request(listCalls, {})
        .catch((e) => e.code),
    ).toBe('http_error');
  });

  it('waits out a 429 for every request of the client, then sends again', async () => {
    const clock = fakeClock();
    let limited = 1;
    const r = recorder(() =>
      limited-- > 0
        ? new Response('{}', { status: 429, headers: { 'Retry-After': '5' } })
        : Response.json({ items: [], nextCursor: null }),
    );
    const client = createApiClient({ fetch: r.fetch, ...clock });
    await client.request(listCalls, {});
    expect(r.calls).toHaveLength(2);
    expect(clock.now()).toBeGreaterThanOrEqual(5_000);
  });

  it('reports a 429 that asks for a long wait, such as a daily limit, at once', async () => {
    const r = recorder(
      () => new Response('{}', { status: 429, headers: { 'Retry-After': '3600' } }),
    );
    const err = await createApiClient({ fetch: r.fetch, ...fakeClock() })
      .request(listCalls, {})
      .catch((e) => e);
    expect(err).toMatchObject({ status: 429, retryAfterSec: 3600 });
    expect(r.calls).toHaveLength(1);
  });

  it('retries network errors and 503 on reads, never a create', async () => {
    const clock = fakeClock();
    let n = 0;
    const flaky = async () => {
      n++;
      if (n === 1) throw new TypeError('Failed to fetch');
      if (n === 2) return new Response('', { status: 503 });
      return Response.json({ items: [], nextCursor: null });
    };
    await createApiClient({ fetch: flaky, ...clock }).request(listCalls, {});
    expect(n).toBe(3);

    let posts = 0;
    const down = async () => {
      posts++;
      throw new TypeError('Failed to fetch');
    };
    await expect(
      createApiClient({ fetch: down, ...clock }).request(createToken, {
        body: { name: 'agent', scopes: ['read'], expiresInDays: null },
      }),
    ).rejects.toThrow('Failed to fetch');
    expect(posts).toBe(1);
  });

  it('paces requests below the server limit', async () => {
    const clock = fakeClock();
    const r = recorder(() => Response.json({ items: [], nextCursor: null }));
    const client = createApiClient({ fetch: r.fetch, maxPerMinute: 60, ...clock });
    await Promise.all(Array.from({ length: 5 }, () => client.request(listCalls, {})));
    expect(r.calls).toHaveLength(5);
    // A burst of 2 (one second's worth), then one request a second.
    expect(clock.now()).toBeGreaterThanOrEqual(3_000);
  });

  it('sends raw bodies and reads text streams', async () => {
    const r = recorder((url) =>
      url.includes('ask')
        ? new Response('one two')
        : Response.json({
            segments: [],
            language: 'he',
            durationSec: 1,
            usage: { usedSeconds: 1, limitSeconds: 60 },
          }),
    );
    const client = createApiClient({ fetch: r.fetch });
    await client.request(transcribe, {
      query: { language: 'he' },
      raw: { bytes: new Uint8Array(4), contentType: 'audio/ogg' },
    });
    expect((r.calls[0]!.init.headers as Record<string, string>)['Content-Type']).toBe('audio/ogg');
    expect(r.calls[0]!.url).toBe('/api/transcribe?language=he');
    let text = '';
    for await (const c of client.stream(ask, {
      body: { question: 'q', transcriptText: 't', consent: true },
    }))
      text += c;
    expect(text).toBe('one two');
  });
});
