import { createApiToken } from '@askcalls/domain/use-cases/tokens';
import { afterEach, describe, expect, it } from 'vitest';
import { session } from '../../web/src/server/testing/fixtures';
import { startTestApp, type TestApp } from '../../web/src/server/testing/http';
import { modelHost } from './agent';

let app: TestApp;
afterEach(() => app?.close());

async function account(env: Record<string, string> = {}) {
  app = startTestApp({ env });
  const u = await app.ports.users.create({ email: 'a@example.test' });
  const { token } = await createApiToken(app.ports, session(u.id), {
    name: 'agent',
    scopes: ['read'],
    expiresInDays: null,
  });
  return { api: app.client({ token }), origin: 'https://calls.example.test' };
}

describe('model host', () => {
  it("uses the instance's EMBEDDING_MODEL_URL", async () => {
    const a = await account({ EMBEDDING_MODEL_URL: 'https://models.example.com/askcalls' });
    expect(await modelHost(a, {})).toBe('https://models.example.com/askcalls');
  });

  it("falls back to the instance's own /models", async () => {
    expect(await modelHost(await account(), {})).toBe('https://calls.example.test/models');
  });

  it('lets ASKCALLS_MODEL_URL override both', async () => {
    const a = await account({ EMBEDDING_MODEL_URL: 'https://models.example.com' });
    expect(await modelHost(a, { ASKCALLS_MODEL_URL: 'http://localhost:9999' })).toBe(
      'http://localhost:9999',
    );
  });

  it('falls back when the instance cannot say', async () => {
    const a = await account();
    app.close();
    expect(await modelHost(a, {})).toBe('https://calls.example.test/models');
  });
});
