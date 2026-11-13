import { captureFetch, describeTelemetryContract } from '@askcalls/domain/contracts/telemetry';
import { scrubbedTelemetry } from '@askcalls/domain/telemetry';
import { describe, expect, it } from 'vitest';
import { createPostHogSink } from '../src/posthog';

const USER = '0190f5a4-3c2b-7d1e-8f00-1234567890ab';

describeTelemetryContract('posthog', (fetch) => createPostHogSink({ apiKey: 'phc_test', fetch }));

describe('posthog sink', () => {
  it('batches product events without person profiles or GeoIP', async () => {
    const { fetch, requests } = captureFetch();
    const t = scrubbedTelemetry([createPostHogSink({ apiKey: 'phc_test', fetch })], {
      isRoute: () => false,
    });
    t.event(USER, { name: 'search', filters: ['date', 'keyword'] });
    t.event(null, { name: 'sign_up' });
    t.error({ code: 'internal' });
    await t.flush();

    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe('https://eu.i.posthog.com/batch/');
    const { api_key, batch } = JSON.parse(requests[0]!.body);
    expect(api_key).toBe('phc_test');
    expect(batch).toHaveLength(2);
    expect(batch[0]).toMatchObject({
      event: 'search',
      distinct_id: USER,
      properties: {
        filters: 'date,keyword',
        filterCount: 2,
        $process_person_profile: false,
        $geoip_disable: true,
      },
    });
    expect(batch[1].distinct_id).not.toBe(USER);
  });
});
