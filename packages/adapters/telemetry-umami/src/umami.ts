import type { TelemetrySink } from '@askcalls/domain/telemetry';

export interface UmamiOptions {
  /** UMAMI_WEBSITE_ID. */
  websiteId: string;
  /** UMAMI_HOST: a self-hosted Umami, or Umami Cloud by default. */
  host?: string;
  /** The site's hostname as Umami shows it (this instance's APP_URL host). */
  hostname: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export const UMAMI_DEFAULT_HOST = 'https://cloud.umami.is';
/** Umami rejects requests without a browser-like User-Agent. */
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AskCalls/1.0';

/**
 * Telemetry `umami`: cookieless analytics through Umami's batch API. Page views carry the
 * route only; product events carry their name and scrubbed fields, never a user id, so Umami
 * stays anonymous. Errors and timings are not sent here.
 */
export function createUmamiSink(opts: UmamiOptions): TelemetrySink {
  const url = `${(opts.host ?? UMAMI_DEFAULT_HOST).replace(/\/+$/, '')}/api/batch`;
  const fetchImpl = opts.fetch ?? fetch;
  return {
    accepts: ['event'],
    async send(records) {
      const events = records.flatMap((r) => {
        if (r.kind !== 'event') return [];
        const base = { website: opts.websiteId, hostname: opts.hostname };
        if (r.name === 'page_view' && typeof r.fields.route === 'string') {
          return [{ type: 'event', payload: { ...base, url: r.fields.route } }];
        }
        return [{ type: 'event', payload: { ...base, url: '/app', name: r.name, data: r.fields } }];
      });
      if (!events.length) return;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
        body: JSON.stringify(events),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 5_000),
      });
      await res.body?.cancel();
    },
  };
}
