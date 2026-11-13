import type { TelemetryRecord, TelemetrySink } from '@askcalls/domain/telemetry';

export interface SentryOptions {
  /** SENTRY_DSN: `https://<public key>@<host>/<project id>`, from Sentry or GlitchTip. */
  dsn: string;
  environment?: string;
  release?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface ParsedDsn {
  envelopeUrl: string;
  publicKey: string;
}

/** Splits a DSN into the envelope endpoint and the public key. Throws on a malformed DSN. */
export function parseDsn(dsn: string): ParsedDsn {
  const url = new URL(dsn);
  const parts = url.pathname.split('/').filter(Boolean);
  const project = parts.pop();
  if (!url.username || !project || !/^\d+$/.test(project) || !/^https?:$/.test(url.protocol)) {
    throw new Error('SENTRY_DSN must look like https://<key>@<host>/<project id>');
  }
  const prefix = parts.length ? `/${parts.join('/')}` : '';
  return {
    envelopeUrl: `${url.protocol}//${url.host}${prefix}/api/${project}/envelope/`,
    publicKey: decodeURIComponent(url.username),
  };
}

type ErrorRecord = Extract<TelemetryRecord, { kind: 'error' }>;

const eventId = () => crypto.randomUUID().replaceAll('-', '');

/** `file:line:col`, newest first (scrubber order) → Sentry frames, oldest first. */
function stacktrace(frames: string[]) {
  if (!frames.length) return undefined;
  return {
    frames: frames
      .map((f) => {
        const [, filename, lineno, colno] = /^(.*):(\d+):(\d+)$/.exec(f) ?? [];
        return { filename, lineno: Number(lineno), colno: Number(colno), in_app: true };
      })
      .reverse(),
  };
}

/**
 * Telemetry `sentry`: server errors to Sentry or a self-hosted GlitchTip over the envelope API
 * (plain fetch, no SDK, so nothing is captured beyond the scrubbed record: no breadcrumbs,
 * request data, user IP or local variables). Identical errors in one batch become one event
 * with an occurrence count, since an envelope carries a single event.
 */
export function createSentrySink(opts: SentryOptions): TelemetrySink {
  const { envelopeUrl, publicKey } = parseDsn(opts.dsn);
  const fetchImpl = opts.fetch ?? fetch;
  const auth = `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=askcalls-telemetry/1.0`;

  const post = async (r: ErrorRecord, occurrences: number) => {
    const id = eventId();
    const event = {
      event_id: id,
      timestamp: r.at / 1000,
      platform: 'node',
      level: 'error',
      logger: 'askcalls',
      ...(opts.environment && { environment: opts.environment }),
      ...(opts.release && { release: opts.release }),
      ...(r.route && { transaction: r.route }),
      exception: {
        values: [{ type: r.errorName ?? 'Error', value: r.code, stacktrace: stacktrace(r.frames) }],
      },
      tags: { code: r.code, ...(r.route && { route: r.route }) },
      extra: { ...r.fields, occurrences },
    };
    const body = [
      JSON.stringify({ event_id: id, sent_at: new Date(r.at).toISOString() }),
      JSON.stringify({ type: 'event', content_type: 'application/json' }),
      JSON.stringify(event),
    ].join('\n');
    const res = await fetchImpl(envelopeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-sentry-envelope', 'x-sentry-auth': auth },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5_000),
    });
    await res.body?.cancel();
  };

  return {
    accepts: ['error'],
    async send(records) {
      const groups = new Map<string, { first: ErrorRecord; n: number }>();
      for (const r of records) {
        if (r.kind !== 'error') continue;
        const key = JSON.stringify([r.code, r.route, r.errorName, r.frames, r.fields]);
        const g = groups.get(key);
        if (g) g.n++;
        else groups.set(key, { first: r, n: 1 });
      }
      await Promise.all([...groups.values()].map((g) => post(g.first, g.n)));
    },
  };
}
