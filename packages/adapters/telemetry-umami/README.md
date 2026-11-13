# @askcalls/adapter-telemetry-umami

Telemetry `umami` (`TELEMETRY=umami`, `UMAMI_WEBSITE_ID`, optional `UMAMI_HOST`, default `https://cloud.umami.is`): cookieless analytics through Umami's batch endpoint (`POST <host>/api/batch`). Plain `fetch`, no tracking script on any page.

- Page views send the route only (`url`), with the instance's hostname from `APP_URL`.
- Product events are custom events on `/app` with their scrubbed fields as `data`. No user id is ever sent, so Umami stays anonymous.
- Requests carry a browser-like User-Agent, which Umami requires.
- Only events are sent; errors and timings are ignored.

`test/umami.test.ts` runs the telemetry contract.
