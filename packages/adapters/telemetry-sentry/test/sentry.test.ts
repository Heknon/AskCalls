import { captureFetch, describeTelemetryContract } from '@askcalls/domain/contracts/telemetry';
import { scrubbedTelemetry } from '@askcalls/domain/telemetry';
import { describe, expect, it } from 'vitest';
import { createSentrySink, parseDsn } from '../src/sentry';

const DSN = 'https://abc123@o1.ingest.de.sentry.io/4507';

describeTelemetryContract('sentry', (fetch) => createSentrySink({ dsn: DSN, fetch }));

describe('sentry sink', () => {
  it('derives the envelope endpoint from Sentry and GlitchTip DSNs', () => {
    expect(parseDsn(DSN)).toEqual({
      envelopeUrl: 'https://o1.ingest.de.sentry.io/api/4507/envelope/',
      publicKey: 'abc123',
    });
    expect(parseDsn('http://key@glitchtip.local:8000/sub/7').envelopeUrl).toBe(
      'http://glitchtip.local:8000/sub/api/7/envelope/',
    );
    expect(() => parseDsn('https://o1.ingest.sentry.io/4507')).toThrow(/SENTRY_DSN/);
  });

  it('sends one event per distinct error with its frames and occurrence count', async () => {
    const { fetch, requests } = captureFetch();
    const t = scrubbedTelemetry([createSentrySink({ dsn: DSN, fetch, release: '1.2.3' })], {
      isRoute: (r) => r === '/api/calls/:id',
    });
    const stack =
      'TypeError: x\n    at f (/srv/app/.next/server/chunks/9.js:10:5)\n    at g (/srv/app/route.js:2:1)';
    for (let i = 0; i < 3; i++) {
      t.error({ code: 'internal', route: '/api/calls/:id', errorName: 'TypeError', stack });
    }
    t.event(null, { name: 'sign_up' });
    await t.flush();

    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers['x-sentry-auth']).toContain('sentry_key=abc123');
    const [, item, event] = requests[0]!.body.split('\n').map((l) => JSON.parse(l));
    expect(item.type).toBe('event');
    expect(event).toMatchObject({
      platform: 'node',
      release: '1.2.3',
      transaction: '/api/calls/:id',
      tags: { code: 'internal', route: '/api/calls/:id' },
      extra: { occurrences: 3 },
    });
    expect(event.exception.values[0]).toMatchObject({ type: 'TypeError', value: 'internal' });
    expect(event.exception.values[0].stacktrace.frames).toEqual([
      { filename: 'route.js', lineno: 2, colno: 1, in_app: true },
      { filename: '9.js', lineno: 10, colno: 5, in_app: true },
    ]);
  });
});
