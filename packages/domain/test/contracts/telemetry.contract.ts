import { describe, expect, it } from 'vitest';
import type { ErrorReport, SafeValue, TelemetryEvent } from '../../src/ports/infra';
import { scrubbedTelemetry, type TelemetrySink } from '../../src/telemetry';

/**
 * Telemetry contract (spec 11.3a, 13): a telemetry adapter is a `TelemetrySink` that sends over
 * the `fetch` it is given. The suite drives it through the shared scrubber with every kind of
 * call, poisoned with transcript words, names and phone numbers in every field a caller could
 * misuse, and fails if any of them reaches a request: URL, headers or body, in any encoding.
 */

export interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** A `fetch` that records requests and answers `status`. */
export function captureFetch(status = 200) {
  const requests: CapturedRequest[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const req = new Request(input, init);
    const body = req.body ? new TextDecoder().decode(await req.arrayBuffer()) : '';
    requests.push({
      url: req.url,
      method: req.method,
      headers: Object.fromEntries(req.headers),
      body,
    });
    return new Response('{}', { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return { fetch: fetchImpl, requests };
}

export const SEEDED = [
  'Orbitex',
  'photovoltaic',
  'warehouse',
  'Zephyrine Quillfeather',
  'Marmalade',
  '88412093',
  '+972547654321',
  '054-765-4321',
  'אגוזית',
  'יהונתן גלבועי',
];

const ROUTES = new Set(['/api/calls/:id', '/api/search', '/pricing']);
const isRoute = (r: string) => ROUTES.has(r);
const USER = '0190f5a4-3c2b-7d1e-8f00-1234567890ab';

/** Every encoding a word could take in a request: as is, lowercase, URL-, JSON- and \u-escaped. */
function forms(word: string): string[] {
  const ascii = JSON.stringify(word).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  return [
    word,
    word.toLowerCase(),
    encodeURIComponent(word),
    encodeURIComponent(word).toLowerCase(),
    ascii.slice(1, -1),
    btoa(String.fromCharCode(...new TextEncoder().encode(word))),
  ];
}

export function leaksIn(requests: CapturedRequest[]): string[] {
  const text = requests
    .map((r) => [r.url, JSON.stringify(r.headers), r.body].join('\n'))
    .join('\n');
  return SEEDED.flatMap((w) =>
    forms(w)
      .filter((f) => text.includes(f))
      .map((f) => `${w} as ${f}`),
  );
}

const [w0, w1, w2, w3, w4, w5, w6, w7, w8, w9] = SEEDED as [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/** Calls a buggy or hostile caller could make: content wherever a string fits. */
function poisoned(): Array<(t: ReturnType<typeof scrubbedTelemetry>) => void> {
  const asEvent = (e: unknown) => e as TelemetryEvent;
  const asReport = (r: unknown) => r as ErrorReport;
  return [
    (t) => t.event(w0!, asEvent({ name: 'sign_up', email: w1, body: { text: w2 } })),
    (t) => t.event(USER, asEvent({ name: 'onboarding_step', step: w0 })),
    (t) => t.event(USER, asEvent({ name: 'upload', mode: 'single', count: 1, fileName: w3 })),
    (t) => t.event(USER, asEvent({ name: 'upload', mode: w4, count: 2 })),
    (t) => t.event(USER, asEvent({ name: 'search', filters: ['keyword', w5], query: w5 })),
    (t) => t.event(null, asEvent({ name: 'page_view', route: `/pricing?q=${w6}#${w7}` })),
    (t) => t.event(null, asEvent({ name: 'page_view', route: `/${w1}` })),
    (t) => t.event(USER, asEvent({ name: w8 })),
    (t) =>
      t.error(
        asReport({
          code: 'internal',
          route: `/api/calls/:id?text=${w0}`,
          errorName: 'TypeError',
          message: `failed on ${w1} ${w9}`,
          stack: [
            `TypeError: cannot read ${w2} of ${w6}`,
            `    at ${w3} (/home/${w4}/app/.next/server/chunks/123.js?v=${w5}:10:5)`,
            `    at async handler (/srv/askcalls/route.js:4:2)`,
            `    ${w7} said ${w8}`,
          ].join('\n'),
          context: {
            callId: w0,
            userId: USER,
            count: 3,
            note: w1,
            code: w2,
            route: `/api/${w3}`,
            [w4]: 1,
          },
          headers: { cookie: w5, authorization: `Bearer ${w6}` },
          body: { transcript: w7 },
          query: `q=${w8}`,
        }),
      ),
    (t) => t.error(asReport({ code: w9, errorName: w0, route: w1 })),
    (t) => t.error(asReport({ code: 'provider_error', errorName: `${w2}Error` })),
    (t) => t.timing(w3, 12, { route: '/api/search', query: w4 } as Record<string, SafeValue>),
    (t) => t.timing('/api/search', 12.5, { filterCount: 2, text: w5 }),
    (t) => t.timing(`askcalls.${w6.toLowerCase()}`, 3, { callId: w7 }),
  ];
}

/** The same calls done right; each kind must still reach a backend that accepts it. */
function legitimate(t: ReturnType<typeof scrubbedTelemetry>) {
  t.event(USER, { name: 'onboarding_step', step: 'recovery' });
  t.event(USER, { name: 'upload', mode: 'bulk', count: 12 });
  t.event(USER, { name: 'search', filters: ['keyword', 'date'] });
  t.event(null, { name: 'page_view', route: '/pricing' });
  t.error({ code: 'internal', route: '/api/search', errorName: 'TypeError' });
  t.timing('/api/search', 42, { filterCount: 2 });
}

/** Builds the adapter under test over the given fetch. */
export type TelemetrySinkFactory = (fetchImpl: typeof fetch) => TelemetrySink;

export function describeTelemetryContract(name: string, make: TelemetrySinkFactory) {
  describe(`Telemetry contract: ${name}`, () => {
    it('sends legitimate calls of every kind it accepts', async () => {
      const { fetch, requests } = captureFetch();
      const t = scrubbedTelemetry([make(fetch)], { isRoute });
      legitimate(t);
      await t.flush();
      expect(requests.length).toBeGreaterThan(0);
      expect(leaksIn(requests)).toEqual([]);
    });

    it('never sends a seeded word, name or number from any field', async () => {
      const { fetch, requests } = captureFetch();
      const t = scrubbedTelemetry([make(fetch)], { isRoute });
      for (const call of poisoned()) call(t);
      legitimate(t);
      await t.flush();
      expect(requests.length).toBeGreaterThan(0);
      expect(leaksIn(requests)).toEqual([]);
    });

    it('batches: many calls, one request per flush and record kind at most', async () => {
      const { fetch, requests } = captureFetch();
      const sink = make(fetch);
      const t = scrubbedTelemetry([sink], { isRoute, maxBatch: 1000 });
      for (let i = 0; i < 20; i++) legitimate(t);
      await t.flush();
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.length).toBeLessThanOrEqual(sink.accepts.length);
    });

    it('never throws when the backend fails or is unreachable', async () => {
      const refused = (async () => {
        throw new TypeError('fetch failed');
      }) as unknown as typeof fetch;
      for (const fetchImpl of [captureFetch(500).fetch, refused]) {
        const t = scrubbedTelemetry([make(fetchImpl)], { isRoute });
        legitimate(t);
        await expect(t.flush()).resolves.toBeUndefined();
      }
    });
  });
}
