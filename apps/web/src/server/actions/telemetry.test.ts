import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionCookie, startTestApp, type TestApp } from '../testing/http';
import { reportClientError, reportProductEvent } from './telemetry';

let cookie = '';
vi.mock('next/headers', () => ({ headers: async () => new Headers({ cookie }) }));

let app: TestApp;
let userId: string;

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

describe('browser telemetry consent (spec 11.3a)', () => {
  it('drops product events and error reports until the account opts in', async () => {
    await reportProductEvent({ name: 'first_search_with_result' });
    await reportClientError({ errorName: 'TypeError', stack });
    expect(app.ports.recordedTelemetry.events).toEqual([]);
    expect(app.ports.recordedTelemetry.errors).toEqual([]);
  });

  it('sends each kind only with its own consent', async () => {
    await consent(false, true);
    await reportProductEvent({ name: 'first_search_with_result' });
    await reportClientError({ errorName: 'TypeError', stack });
    expect(app.ports.recordedTelemetry.events).toEqual([]);
    expect(app.ports.recordedTelemetry.errors).toEqual([
      { code: 'client', errorName: 'TypeError', stack },
    ]);

    await consent(true, false);
    await reportProductEvent({ name: 'first_search_with_result' });
    await reportClientError({ errorName: 'TypeError', stack });
    expect(app.ports.recordedTelemetry.events).toEqual([
      { userId, event: { name: 'first_search_with_result' } },
    ]);
    expect(app.ports.recordedTelemetry.errors).toHaveLength(1);
  });

  it('ignores signed-out callers', async () => {
    await consent(true, true);
    cookie = '';
    await reportClientError({ errorName: 'TypeError', stack });
    expect(app.ports.recordedTelemetry.errors).toEqual([]);
  });
});
