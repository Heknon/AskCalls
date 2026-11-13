# @askcalls/adapter-telemetry-otel

Telemetry `otel` (`TELEMETRY=otel`): OTLP/HTTP with JSON encoding to any OpenTelemetry collector or vendor. Plain `fetch`, no SDK.

| Setting | Use |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Base URL; records go to `<endpoint>/v1/logs` and `<endpoint>/v1/metrics` |
| `OTEL_EXPORTER_OTLP_HEADERS` | `key=value,key2=value2`, values URL-encoded (auth headers) |

- Events are INFO log records with `event.name`, `user.id` (a UUID, product events only) and `askcalls.<field>` attributes.
- Errors are ERROR log records with `error.type` (the code), `exception.type` (the class name), `exception.stacktrace` (`file:line:col` frames) and `http.route`.
- Timings are delta histograms named after the route or `askcalls.<metric>`, one data point per measurement, unit `ms`.

The sink receives scrubbed records only (`@askcalls/domain/telemetry`); `test/otel.test.ts` runs the telemetry contract.
