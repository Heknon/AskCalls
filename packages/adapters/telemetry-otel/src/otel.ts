import type { TelemetryFields, TelemetryRecord, TelemetrySink } from '@askcalls/domain/telemetry';

export interface OtelOptions {
  /** OTLP/HTTP base URL (OTEL_EXPORTER_OTLP_ENDPOINT); signals go to `/v1/logs`, `/v1/metrics`. */
  endpoint: string;
  /** OTEL_EXPORTER_OTLP_HEADERS: `key=value,key2=value2`, values URL-encoded. */
  headers?: string;
  serviceName?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type AnyValue =
  | { stringValue: string }
  | { intValue: string }
  | { doubleValue: number }
  | { boolValue: boolean };
type KeyValue = { key: string; value: AnyValue };

/** Parses the OTLP headers variable (OpenTelemetry spec: W3C baggage-style list). */
export function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (raw ?? '').split(',')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    if (key) out[key] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const nanos = (ms: number) => (BigInt(Math.round(ms)) * 1_000_000n).toString();

function value(v: string | number | boolean): AnyValue {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { boolValue: v };
  return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
}

function attributes(
  pairs: Record<string, string | number | boolean | null | undefined>,
): KeyValue[] {
  return Object.entries(pairs).flatMap(([key, v]) =>
    v === null || v === undefined ? [] : [{ key, value: value(v) }],
  );
}

const prefixed = (fields: TelemetryFields) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [`askcalls.${k}`, v]));

function logRecord(r: TelemetryRecord) {
  if (r.kind === 'event') {
    return {
      timeUnixNano: nanos(r.at),
      severityNumber: 9,
      severityText: 'INFO',
      eventName: `askcalls.${r.name}`,
      body: { stringValue: r.name },
      attributes: attributes({ 'event.name': r.name, 'user.id': r.userId, ...prefixed(r.fields) }),
    };
  }
  if (r.kind !== 'error') return null;
  return {
    timeUnixNano: nanos(r.at),
    severityNumber: 17,
    severityText: 'ERROR',
    body: { stringValue: r.code },
    attributes: attributes({
      'error.type': r.code,
      'exception.type': r.errorName,
      'exception.stacktrace': r.frames.length ? r.frames.join('\n') : null,
      'http.route': r.route,
      ...prefixed(r.fields),
    }),
  };
}

/**
 * Telemetry `otel`: OTLP/HTTP with JSON encoding to any OpenTelemetry collector or vendor
 * (Grafana Cloud, SigNoz, OpenObserve, Honeycomb, …). Events and errors are log records,
 * timings are delta histograms. It receives scrubbed records only (`@askcalls/domain/telemetry`).
 */
export function createOtelSink(opts: OtelOptions): TelemetrySink {
  const base = opts.endpoint.replace(/\/+$/, '');
  const fetchImpl = opts.fetch ?? fetch;
  const headers = { ...parseOtlpHeaders(opts.headers), 'content-type': 'application/json' };
  const resource = {
    attributes: attributes({ 'service.name': opts.serviceName ?? 'askcalls' }),
  };
  const scope = { name: 'askcalls' };

  const post = async (path: string, body: unknown) => {
    const res = await fetchImpl(`${base}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5_000),
    });
    await res.body?.cancel();
  };

  return {
    accepts: ['event', 'error', 'timing'],
    async send(records) {
      const sends: Promise<void>[] = [];
      const logs = records.flatMap((r) => logRecord(r) ?? []);
      if (logs.length) {
        sends.push(
          post('/v1/logs', {
            resourceLogs: [{ resource, scopeLogs: [{ scope, logRecords: logs }] }],
          }),
        );
      }
      const byName = new Map<string, Extract<TelemetryRecord, { kind: 'timing' }>[]>();
      for (const r of records) {
        if (r.kind !== 'timing') continue;
        byName.set(r.name, [...(byName.get(r.name) ?? []), r]);
      }
      if (byName.size) {
        const metrics = [...byName].map(([name, points]) => ({
          name,
          unit: 'ms',
          histogram: {
            aggregationTemporality: 1,
            dataPoints: points.map((p) => ({
              startTimeUnixNano: nanos(p.at - p.ms),
              timeUnixNano: nanos(p.at),
              count: '1',
              sum: p.ms,
              min: p.ms,
              max: p.ms,
              bucketCounts: ['1'],
              explicitBounds: [],
              attributes: attributes(p.fields),
            })),
          },
        }));
        sends.push(
          post('/v1/metrics', {
            resourceMetrics: [{ resource, scopeMetrics: [{ scope, metrics }] }],
          }),
        );
      }
      await Promise.all(sends);
    },
  };
}
