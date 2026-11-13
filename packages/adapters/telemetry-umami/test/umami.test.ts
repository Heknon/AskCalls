import { captureFetch, describeTelemetryContract } from '@askcalls/domain/contracts/telemetry';
import { scrubbedTelemetry } from '@askcalls/domain/telemetry';
import { describe, expect, it } from 'vitest';
import { createUmamiSink } from '../src/umami';

const WEBSITE = '6f1c2e3a-0000-4000-8000-000000000001';
const USER = '0190f5a4-3c2b-7d1e-8f00-1234567890ab';

describeTelemetryContract('umami', (fetch) =>
  createUmamiSink({ websiteId: WEBSITE, hostname: 'askcalls.example', fetch }),
);

describe('umami sink', () => {
  it('sends page views and product events without a user id', async () => {
    const { fetch, requests } = captureFetch();
    const sink = createUmamiSink({
      websiteId: WEBSITE,
      hostname: 'askcalls.example',
      host: 'https://umami.example.org/',
      fetch,
    });
    const t = scrubbedTelemetry([sink], { isRoute: (r) => r === '/pricing' });
    t.event(null, { name: 'page_view', route: '/pricing' });
    t.event(USER, { name: 'agent_linked' });
    await t.flush();

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe('https://umami.example.org/api/batch');
    expect(requests[0]!.headers['user-agent']).toMatch(/^Mozilla\/5\.0/);
    expect(JSON.parse(requests[0]!.body)).toEqual([
      {
        type: 'event',
        payload: { website: WEBSITE, hostname: 'askcalls.example', url: '/pricing' },
      },
      {
        type: 'event',
        payload: {
          website: WEBSITE,
          hostname: 'askcalls.example',
          url: '/app',
          name: 'agent_linked',
          data: {},
        },
      },
    ]);
    expect(requests[0]!.body).not.toContain(USER);
  });
});
