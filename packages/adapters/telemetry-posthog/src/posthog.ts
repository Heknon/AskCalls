import type { TelemetrySink } from '@askcalls/domain/telemetry';

export interface PostHogOptions {
  /** POSTHOG_KEY: the project API key (public, write-only). */
  apiKey: string;
  /** POSTHOG_HOST: the ingestion host; PostHog EU Cloud by default. */
  host?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export const POSTHOG_DEFAULT_HOST = 'https://eu.i.posthog.com';

/**
 * Telemetry `posthog`: product events to PostHog Cloud or a self-hosted PostHog through the
 * batch capture API. No person profiles, no GeoIP; anonymous events (sign-up, page views) get a
 * fresh random distinct id each, so nothing links them. Errors and timings are not sent here.
 */
export function createPostHogSink(opts: PostHogOptions): TelemetrySink {
  const url = `${(opts.host ?? POSTHOG_DEFAULT_HOST).replace(/\/+$/, '')}/batch/`;
  const fetchImpl = opts.fetch ?? fetch;
  return {
    accepts: ['event'],
    async send(records) {
      const batch = records.flatMap((r) =>
        r.kind === 'event'
          ? [
              {
                event: r.name,
                distinct_id: r.userId ?? crypto.randomUUID(),
                timestamp: new Date(r.at).toISOString(),
                properties: {
                  ...r.fields,
                  $process_person_profile: false,
                  $geoip_disable: true,
                  $lib: 'askcalls',
                },
              },
            ]
          : [],
      );
      if (!batch.length) return;
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: opts.apiKey, historical_migration: false, batch }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 5_000),
      });
      await res.body?.cancel();
    },
  };
}
