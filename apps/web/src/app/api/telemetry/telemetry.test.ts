import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sessionCookie, startTestApp, type TestApp } from '../../../server/testing/http';

let app: TestApp;
let userId: string;
let cookie: string;

beforeEach(async () => {
  app = startTestApp();
  userId = (await app.ports.users.create({ email: 'consent@example.test' })).id;
  cookie = await sessionCookie(userId);
});
afterEach(() => app.close());

const consent = (productEvents: boolean, errorReports: boolean) =>
  app.ports.users.update(userId, { telemetryConsent: { productEvents, errorReports } });

const stack =
  'TypeError: Orbitex\n    at x (https://askcalls.example/_next/static/chunks/1.js:2:3)';
const send = async () => {
  const a = await app.req('POST', '/api/telemetry/events', {
    as: { cookie },
    json: { name: 'first_search_with_result' },
  });
  const b = await app.req('POST', '/api/telemetry/errors', {
    as: { cookie },
    json: { errorName: 'TypeError', stack },
  });
  expect([a.status, b.status]).toEqual([200, 200]);
};

describe('browser telemetry (spec 11.3a)', () => {
  it('drops product events and error reports until the account opts in', async () => {
    await send();
    expect(app.ports.recordedTelemetry.events).toEqual([]);
    expect(app.ports.recordedTelemetry.errors).toEqual([]);
  });

  it('sends each kind only with its own consent', async () => {
    await consent(false, true);
    await send();
    expect(app.ports.recordedTelemetry.events).toEqual([]);
    expect(app.ports.recordedTelemetry.errors).toEqual([
      { code: 'client', errorName: 'TypeError', stack },
    ]);

    await consent(true, false);
    await send();
    expect(app.ports.recordedTelemetry.events).toEqual([
      { userId, event: { name: 'first_search_with_result' } },
    ]);
    expect(app.ports.recordedTelemetry.errors).toHaveLength(1);
  });

  it('accepts only the typed product events', async () => {
    await consent(true, true);
    const res = await app.req('POST', '/api/telemetry/events', {
      as: { cookie },
      json: { name: 'search', query: 'Orbitex' },
    });
    expect(res.status).toBe(400);
    expect(app.ports.recordedTelemetry.events).toEqual([]);
  });
});
