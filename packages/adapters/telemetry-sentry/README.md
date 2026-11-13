# @askcalls/adapter-telemetry-sentry

Telemetry `sentry` (`TELEMETRY=sentry`, `SENTRY_DSN`): errors to Sentry or a self-hosted GlitchTip through the [envelope endpoint](https://develop.sentry.dev/sdk/data-model/envelopes/). Plain `fetch`, no SDK, so nothing is captured beyond the scrubbed record: no breadcrumbs, request data, user IP, local variables or source context.

- The DSN `https://<key>@<host>[/<path>]/<project>` gives `https://<host>[/<path>]/api/<project>/envelope/` and the `X-Sentry-Auth` key.
- Each event has `platform: node`, `level: error`, the code as the exception value, the class name as its type, frames as `filename`/`lineno`/`colno` (oldest first), the route as `transaction` and tag, and the scrubbed fields under `extra`.
- An envelope carries one event, so identical errors in a batch become one event with `extra.occurrences`.
- Only errors are sent; events and timings are ignored.

`test/sentry.test.ts` runs the telemetry contract.
