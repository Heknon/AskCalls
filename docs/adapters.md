# Writing an adapter

Every external service AskCalls uses sits behind a port: an interface in `packages/domain/src/ports/`. An adapter implements one port for one service, in its own package, and is chosen by configuration. This page walks through adding one; the telemetry adapters (`packages/adapters/telemetry-*`) are small, complete examples.

## The rules

- **One package per adapter**, at `packages/adapters/<port>-<service>/`, named `@askcalls/adapter-<port>-<service>`. It depends on `@askcalls/domain` and on whatever it needs to talk to its service.
- **Adapters never import other adapters** (the mocks package excepted). Code two adapters share belongs to the port: in `packages/domain`, as the telemetry scrubber does.
- **The domain never imports an adapter or a vendor SDK.** `bun run boundaries` (dependency-cruiser, `.dependency-cruiser.cjs`) fails CI otherwise.
- **No env vars, no config files.** The adapter takes everything in its constructor or factory options, including `fetch`. Only `ConfigService` in apps/web reads configuration; the composition root passes values in.
- **Take `fetch` as an option** and use it for every request. The composition root passes a guarded fetch that refuses non-local hosts in offline mode, and tests pass a recording fetch.
- **Content-free errors and logs.** Throw `DomainError(code, message)` with ids, counts and codes only. Never put a request or response body, a transcript or a key in a message.
- **No plaintext at rest.** Storage adapters only ever receive ciphertext, tokens and vectors; provider adapters that handle plaintext (transcription, LLM) stream it and keep nothing.
- **Isomorphic where the port is.** Client-side ports (`Embedder`, `AudioCodec`, `SecretStore`) have browser and agent adapters in `apps/web/src/client/adapters` and `apps/agent/src/adapters`.

## 1. Pick the port

| Port | File | Contract suite |
| --- | --- | --- |
| `UserRepository`, `KeyringRepository`, `CallRepository`, `SearchIndex`, `VocabularyStore`, `UserDataStore`, `InboxRepository`, `ApiTokenRepository`, `AuditLog`, `RateLimiter`, `LocalCredentialRepository` | `ports/repositories.ts`, `ports/search-index.ts` | `user-repository`, `keyring-repository`, `call-repository`, `search-index`, `small-stores`, `local-credentials` |
| `BlobStore` | `ports/blob-store.ts` | `blob-store` |
| `TranscriptionProvider`, `LlmProvider` | `ports/providers.ts` | `providers` |
| `Telemetry` (as a `TelemetrySink`) | `ports/infra.ts`, `src/telemetry.ts` | `telemetry` |
| `Scheduler`, `Clock`, `IdGenerator`, `BillingProvider` | `ports/infra.ts` | none (small; see `adapter-runtime`) |

Contract suites live in `packages/domain/test/contracts/<port>.contract.ts` and are imported as `@askcalls/domain/contracts/<port>`.

## 2. Create the package

```
packages/adapters/blob-example/
  package.json
  tsconfig.json
  README.md          what the service needs, how requests map, retention, limits
  src/index.ts       the public exports
  src/example.ts
  test/example.test.ts
```

```json
{
  "name": "@askcalls/adapter-blob-example",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit -p ." },
  "dependencies": { "@askcalls/domain": "workspace:*" },
  "devDependencies": { "vitest": "5.1.0" }
}
```

```json
{ "extends": "../../../tsconfig.base.json", "include": ["src", "test"] }
```

Packages export TypeScript source; there is no build step. Run `bun install` so the workspace links it.

## 3. Implement the port

```ts
import type { BlobStore, HealthResult } from '@askcalls/domain';

export interface ExampleBlobStoreOptions {
  endpoint: string;
  token: string;
  fetch?: typeof fetch;
}

export class ExampleBlobStore implements BlobStore {
  constructor(private readonly opts: ExampleBlobStoreOptions) {}
  async healthCheck(): Promise<HealthResult> { /* … */ }
  async put(key: string, body: Uint8Array): Promise<void> { /* … */ }
  // …every method of the port
}
```

Implement `healthCheck()` where the port has one: the admin page's "Test connection" and the setup wizard call it before a configuration is saved.

## 4. Run the contract suite

A new adapter is done when it passes its port's contract suite against a real instance of the service, or against recorded responses for paid APIs (no live keys in CI).

```ts
import { describeBlobStoreContract } from '@askcalls/domain/contracts/blob-store';
import { ExampleBlobStore } from '../src/example';

describeBlobStoreContract('example', {
  setup: async () => new ExampleBlobStore({ endpoint: URL_OF_A_TEST_INSTANCE, token: 'test' }),
});
```

Where the tests run:

- `*.test.ts` runs in `bun run test` and the fast checks on every pull request. Use it for in-process instances (PGlite, a temporary directory) and recorded fixtures (see `transcription-deepgram/test/replay.ts`).
- `*.int.test.ts` runs in `bun run test:integration` against Docker services (Postgres with pgvector, MinIO), locally and in `ci.yml` before production. Use it when the service needs a container.

Add tests of your own for what the suite can't know: request format, error mapping, retention flags.

### Telemetry adapters

A telemetry adapter is a `TelemetrySink` (`@askcalls/domain/telemetry`): it declares which record kinds it accepts and sends batches of already scrubbed records. It never sees a raw event, so it cannot leak one.

```ts
import type { TelemetrySink } from '@askcalls/domain/telemetry';

export function createExampleSink(opts: { url: string; fetch?: typeof fetch }): TelemetrySink {
  const fetchImpl = opts.fetch ?? fetch;
  return {
    accepts: ['event'],
    async send(records) {
      await fetchImpl(opts.url, { method: 'POST', body: JSON.stringify(records) });
    },
  };
}
```

```ts
import { describeTelemetryContract } from '@askcalls/domain/contracts/telemetry';
describeTelemetryContract('example', (fetch) => createExampleSink({ url: 'https://t.example', fetch }));
```

The suite drives the sink through the scrubber with calls poisoned with transcript words, names and phone numbers in every field, and fails if any of them reaches the URL, headers or body of a request in any encoding.

## 5. Wire it in

1. Add the package to `apps/web/package.json` dependencies and to `transpilePackages` in `apps/web/next.config.ts`.
2. Add a `case` to the port's builder in `apps/web/src/server/adapters/<port>.ts`, reading the options from `InstanceConfig`. In offline mode, call `assertLocalTarget(config.offlineMode, url)` for every host the adapter connects to, and pass the composition root's `fetch` through.
3. If it needs settings, add them to the config schema (`apps/web/src/server/config/schema.ts`) with their env var in the env table, mark secrets in `SECRET_PATHS`, list the variables in `.env.example`, and add the field to the admin instance page.
4. If it reaches the internet, add its host to the offline blockers in `apps/web/src/server/config/offline.ts`.
5. Document it in the adapter's README and in [self-hosting.md](self-hosting.md).

`bun run check` must pass: lint, typecheck, boundaries, and the unit and contract tests, including the leak test.
