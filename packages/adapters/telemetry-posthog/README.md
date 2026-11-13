# @askcalls/adapter-telemetry-posthog

Telemetry `posthog` (`TELEMETRY=posthog`, `POSTHOG_KEY`, optional `POSTHOG_HOST`, default `https://eu.i.posthog.com`): product events through PostHog's batch capture endpoint (`POST <host>/batch/`). Plain `fetch`, no SDK.

- Every event sets `$process_person_profile: false` and `$geoip_disable: true`: no person profiles, no location from the sending IP (always the server's anyway).
- Product events carry the account's UUID as `distinct_id`; they reach the port only when the account opted in. Anonymous events (sign-up, page views) get a fresh random id each, so nothing links them.
- Only events are sent; errors and timings are ignored.

`test/posthog.test.ts` runs the telemetry contract.
