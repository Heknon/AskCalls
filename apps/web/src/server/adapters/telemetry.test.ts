import { noTelemetry } from '@askcalls/adapter-runtime';
import { captureFetch, leaksIn, SEEDED } from '@askcalls/domain/contracts/telemetry';
import { describe, expect, it } from 'vitest';
import { ConfigService } from '../config/config-service';
import { OfflineBlockedError } from '../http/offline-fetch';
import { ROUTES } from '../testing/http';
import { buildTelemetry, TELEMETRY_ROUTES } from './telemetry';

const config = (env: Record<string, string>) =>
  new ConfigService({
    DB_DRIVER: 'memory',
    APP_URL: 'https://askcalls.example',
    ...env,
  }).loadFromEnvOnly().config;

const ALL = {
  TELEMETRY: 'otel,sentry,posthog,umami',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.org',
  SENTRY_DSN: 'https://key@sentry.example.org/12',
  POSTHOG_KEY: 'phc_test',
  UMAMI_WEBSITE_ID: '6f1c2e3a-0000-4000-8000-000000000001',
  UMAMI_HOST: 'https://umami.example.org',
};

describe('buildTelemetry', () => {
  it('is the no-op adapter when TELEMETRY is empty or none', async () => {
    expect(await buildTelemetry(config({}))).toBe(noTelemetry);
    expect(await buildTelemetry(config({ TELEMETRY: 'none' }))).toBe(noTelemetry);
  });

  it('fans a comma list out to every backend through the scrubber', async () => {
    const { fetch, requests } = captureFetch();
    const t = await buildTelemetry(config(ALL), fetch);
    t.event(null, { name: 'page_view', route: `/pricing?q=${SEEDED[0]}` });
    t.error({
      code: 'internal',
      route: '/api/calls/:id',
      errorName: 'TypeError',
      context: { note: SEEDED[1]! },
    });
    t.timing('/api/search', 20);
    await t.flush();
    expect(new Set(requests.map((r) => new URL(r.url).host))).toEqual(
      new Set(['otlp.example.org', 'sentry.example.org', 'eu.i.posthog.com', 'umami.example.org']),
    );
    expect(leaksIn(requests)).toEqual([]);
    const umami = requests.find((r) => r.url.startsWith('https://umami.example.org'))!;
    expect(JSON.parse(umami.body)[0].payload).toMatchObject({
      url: '/pricing',
      hostname: 'askcalls.example',
    });
  });

  it('names the missing setting for a selected backend', async () => {
    await expect(buildTelemetry(config({ TELEMETRY: 'sentry' }))).rejects.toThrow(/SENTRY_DSN/);
    await expect(buildTelemetry(config({ TELEMETRY: 'otel' }))).rejects.toThrow(
      /OTEL_EXPORTER_OTLP_ENDPOINT/,
    );
  });

  it('knows every API route template, the MCP endpoint and the marketing pages', () => {
    for (const [pattern] of ROUTES) {
      expect(TELEMETRY_ROUTES.has(pattern.replace(/\[(\w+)\]/g, ':$1')), pattern).toBe(true);
    }
    for (const r of ['/api/mcp', '/', '/pricing']) expect(TELEMETRY_ROUTES.has(r)).toBe(true);
    expect(TELEMETRY_ROUTES.has('/app/calls/:id')).toBe(false);
  });
});

describe('buildTelemetry in offline mode', () => {
  it('refuses a backend outside the local network', async () => {
    const offline = {
      OFFLINE_MODE: 'true',
      AUTH_LOCAL_ACCOUNTS: 'true',
      AUTH_PROVIDERS: 'none',
      TRANSCRIPTION_PROVIDER: 'none',
      LLM_PROVIDER: 'none',
    };
    const resolved = new ConfigService({
      DB_DRIVER: 'memory',
      BLOB_DRIVER: 'memory',
      ...offline,
      TELEMETRY: 'otel',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector.local:4318',
    }).loadFromEnvOnly().config;
    await expect(buildTelemetry(resolved)).resolves.toBeDefined();
    await expect(
      buildTelemetry({
        ...resolved,
        telemetry: { ...resolved.telemetry, otel: { endpoint: 'https://otlp.example.org' } },
      }),
    ).rejects.toBeInstanceOf(OfflineBlockedError);
  });
});
