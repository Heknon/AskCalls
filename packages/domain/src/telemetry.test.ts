import { describe, expect, it } from 'vitest';
import type { TelemetryEvent } from './ports/infra';
import {
  scrubbedTelemetry,
  scrubError,
  scrubEvent,
  scrubTiming,
  type TelemetryRecord,
} from './telemetry';

const opts = { isRoute: (r: string) => ['/api/calls/:id', '/pricing', '/'].includes(r) };
const USER = '0190F5A4-3C2B-7D1E-8F00-1234567890AB';

describe('telemetry scrubber', () => {
  it('keeps the allowed fields of each event and nothing else', () => {
    expect(scrubEvent(USER, { name: 'upload', mode: 'bulk', count: 4 }, opts, 1)).toEqual({
      kind: 'event',
      at: 1,
      userId: USER.toLowerCase(),
      name: 'upload',
      fields: { mode: 'bulk', count: 4 },
    });
    expect(
      scrubEvent(null, { name: 'search', filters: ['tag', 'date', 'tag'] }, opts),
    ).toMatchObject({
      fields: { filters: 'date,tag', filterCount: 2 },
    });
    expect(scrubEvent('not-a-uuid', { name: 'sign_up' }, opts)).toMatchObject({
      userId: null,
      fields: {},
    });
  });

  it('drops events with unknown names or values off their lists', () => {
    const bad = [
      { name: 'custom' },
      { name: 'onboarding_step', step: 'Orbitex' },
      { name: 'upload', mode: 'single', count: -1 },
      { name: 'upload', mode: 'single', count: 1.5 },
      { name: 'page_view', route: '/somewhere-else' },
    ] as unknown as TelemetryEvent[];
    for (const e of bad) expect(scrubEvent(null, e, opts)).toBeNull();
  });

  it('strips query strings, fragments and trailing slashes from routes', () => {
    expect(
      scrubEvent(null, { name: 'page_view', route: '/pricing/?q=Orbitex#x' }, opts),
    ).toMatchObject({
      fields: { route: '/pricing' },
    });
    expect(scrubEvent(null, { name: 'page_view', route: '/?ref=a' }, opts)).toMatchObject({
      fields: { route: '/' },
    });
  });

  it('reduces an error to code, route, class name and file:line:col frames', () => {
    const r = scrubError(
      {
        code: 'not_found',
        route: '/api/calls/:id?x=1',
        errorName: 'DomainError',
        stack:
          'DomainError: Orbitex\n    at load (/home/someone/app/x.js?v=2:3:4)\n    at <anonymous>',
        context: { callId: 'nope', count: 2, ok: true, text: 'Orbitex', Weird: 1 },
      },
      opts,
      5,
    );
    expect(r).toEqual({
      kind: 'error',
      at: 5,
      code: 'not_found',
      route: '/api/calls/:id',
      errorName: 'DomainError',
      frames: ['x.js:3:4'],
      fields: { count: 2, ok: true },
    });
    expect(scrubError({ code: 'Orbitex', errorName: 'Orbitex' }, opts)).toMatchObject({
      code: 'other',
      errorName: null,
    });
  });

  it('accepts timings named after a route or an askcalls metric', () => {
    expect(scrubTiming('/api/calls/:id', 12.34567, { filterCount: 1 }, opts, 9)).toEqual({
      kind: 'timing',
      at: 9,
      name: '/api/calls/:id',
      ms: 12.346,
      fields: { filterCount: 1 },
    });
    expect(scrubTiming('askcalls.search.sql', 1, undefined, opts)).toMatchObject({
      name: 'askcalls.search.sql',
    });
    expect(scrubTiming('Orbitex', 1, undefined, opts)).toBeNull();
    expect(scrubTiming('/api/calls/:id', Number.NaN, undefined, opts)).toBeNull();
  });
});

describe('scrubbedTelemetry', () => {
  const sink = (accepts: TelemetryRecord['kind'][]) => {
    const batches: TelemetryRecord[][] = [];
    return {
      batches,
      sink: { accepts, send: async (b: TelemetryRecord[]) => void batches.push(b) },
    };
  };

  it('fans out to the sinks that accept each kind and sends full batches at once', async () => {
    const errors = sink(['error']);
    const events = sink(['event']);
    const t = scrubbedTelemetry([errors.sink, events.sink], { ...opts, maxBatch: 2 });
    t.error({ code: 'internal' });
    t.event(null, { name: 'sign_up' });
    t.event(null, { name: 'sign_up' });
    await Promise.resolve();
    expect(events.batches).toHaveLength(1);
    await t.flush();
    expect(errors.batches.flat().map((r) => r.kind)).toEqual(['error']);
    expect(events.batches.flat()).toHaveLength(2);
  });

  it('sends a partial batch after the interval', async () => {
    const s = sink(['event']);
    const t = scrubbedTelemetry([s.sink], { ...opts, flushIntervalMs: 5 });
    t.event(null, { name: 'sign_up' });
    await new Promise((r) => setTimeout(r, 30));
    expect(s.batches).toHaveLength(1);
  });

  it('never throws to the caller', () => {
    const t = scrubbedTelemetry([], opts);
    expect(() => t.event(null, null as unknown as TelemetryEvent)).not.toThrow();
    expect(() => t.error(null as never)).not.toThrow();
  });
});
