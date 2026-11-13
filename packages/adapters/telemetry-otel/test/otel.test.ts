import { captureFetch, describeTelemetryContract } from '@askcalls/domain/contracts/telemetry';
import { scrubbedTelemetry } from '@askcalls/domain/telemetry';
import { describe, expect, it } from 'vitest';
import { createOtelSink, parseOtlpHeaders } from '../src/otel';

const ENDPOINT = 'https://otlp.example.org/otlp';
const USER = '0190f5a4-3c2b-7d1e-8f00-1234567890ab';

describeTelemetryContract('otel', (fetch) => createOtelSink({ endpoint: ENDPOINT, fetch }));

describe('otel sink', () => {
  it('parses OTEL_EXPORTER_OTLP_HEADERS', () => {
    expect(parseOtlpHeaders('Authorization=Basic%20abc,x-scope = tenant1,,bad')).toEqual({
      Authorization: 'Basic abc',
      'x-scope': 'tenant1',
    });
  });

  it('posts events and errors as OTLP logs and timings as histograms', async () => {
    const { fetch, requests } = captureFetch();
    const t = scrubbedTelemetry(
      [createOtelSink({ endpoint: `${ENDPOINT}/`, headers: 'api-key=k1', fetch })],
      { isRoute: (r) => r === '/api/search' },
    );
    t.event(USER, { name: 'upload', mode: 'bulk', count: 3 });
    t.error({ code: 'internal', route: '/api/search', errorName: 'TypeError' });
    t.timing('/api/search', 12.5, { filterCount: 2 });
    await t.flush();

    const logs = requests.find((r) => r.url === `${ENDPOINT}/v1/logs`)!;
    expect(logs.headers['api-key']).toBe('k1');
    const records = JSON.parse(logs.body).resourceLogs[0].scopeLogs[0].logRecords;
    expect(records.map((r: { severityText: string }) => r.severityText)).toEqual(['INFO', 'ERROR']);
    expect(records[0].attributes).toEqual(
      expect.arrayContaining([
        { key: 'user.id', value: { stringValue: USER } },
        { key: 'askcalls.count', value: { intValue: '3' } },
      ]),
    );
    expect(records[1].attributes).toEqual(
      expect.arrayContaining([{ key: 'http.route', value: { stringValue: '/api/search' } }]),
    );

    const metrics = requests.find((r) => r.url === `${ENDPOINT}/v1/metrics`)!;
    const metric = JSON.parse(metrics.body).resourceMetrics[0].scopeMetrics[0].metrics[0];
    expect(metric).toMatchObject({ name: '/api/search', unit: 'ms' });
    expect(metric.histogram.dataPoints[0]).toMatchObject({ count: '1', sum: 12.5 });
  });
});
