import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { encode } from 'next-auth/jwt';
import { describe, expect, it } from 'vitest';
import { ConfigService } from '../config/config-service';
import { makeTestPorts } from '../testing/ports';
import { createAuthAdapter, findOrCreateUser } from './adapter';
import { buildAuthConfig, enabledProviders, testProviderEnabled } from './config';
import { verifyGoogleIdToken } from './google-one-tap';
import { authSecret, readSessionUserId } from './secret';

const resolve = (env: Record<string, string>) =>
  new ConfigService({ DB_DRIVER: 'memory', BLOB_DRIVER: 'memory', ...env }).loadFromEnvOnly();

describe('Auth.js adapter over UserRepository', () => {
  it('makes the first user admin and drops OAuth tokens', async () => {
    const ports = makeTestPorts();
    const adapter = createAuthAdapter(ports);
    const first = await adapter.createUser!({
      id: '',
      email: 'Owner@Example.test',
      emailVerified: null,
      name: 'Owner',
    });
    const second = await adapter.createUser!({
      id: '',
      email: 'b@example.test',
      emailVerified: null,
    });
    expect((await ports.users.findById(first.id))?.role).toBe('admin');
    expect((await ports.users.findById(second.id))?.role).toBe('user');
    expect(first.email).toBe('owner@example.test');
    await adapter.linkAccount!({
      userId: first.id,
      provider: 'github',
      providerAccountId: '42',
      type: 'oauth',
      access_token: 'gho_secret',
      refresh_token: 'r',
    });
    await adapter.linkAccount!({
      userId: first.id,
      provider: 'github',
      providerAccountId: '42',
      type: 'oauth',
    });
    expect(ports.db.accounts).toEqual([
      { userId: first.id, provider: 'github', providerAccountId: '42', type: 'oauth' },
    ]);
    expect(
      (await adapter.getUserByAccount!({ provider: 'github', providerAccountId: '42' }))?.id,
    ).toBe(first.id);
    await adapter.createVerificationToken!({
      identifier: 'b@example.test',
      token: 'h',
      expires: new Date(),
    });
    expect(
      await adapter.useVerificationToken!({ identifier: 'b@example.test', token: 'h' }),
    ).not.toBeNull();
    expect(
      await adapter.useVerificationToken!({ identifier: 'b@example.test', token: 'h' }),
    ).toBeNull();
  });

  it('links verified emails and refuses unverified ones', async () => {
    const ports = makeTestPorts();
    const existing = await ports.users.create({ email: 'a@example.test' });
    const base = { provider: 'google', type: 'oidc' as const, name: null, image: null };
    await expect(
      findOrCreateUser(ports, {
        ...base,
        providerAccountId: 'g1',
        email: 'a@example.test',
        emailVerified: false,
      }),
    ).rejects.toThrow('OAuthAccountNotLinked');
    const linked = await findOrCreateUser(ports, {
      ...base,
      providerAccountId: 'g1',
      email: 'A@example.test',
      emailVerified: true,
    });
    expect(linked.id).toBe(existing.id);
    const again = await findOrCreateUser(ports, {
      ...base,
      providerAccountId: 'g1',
      email: null,
      emailVerified: false,
    });
    expect(again.id).toBe(existing.id);
    const fresh = await findOrCreateUser(ports, {
      ...base,
      providerAccountId: 'g2',
      email: 'new@example.test',
      emailVerified: true,
    });
    expect(fresh.id).not.toBe(existing.id);
  });
});

describe('Google One Tap ID token verification', () => {
  it('checks signature, issuer, audience and expiry', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
    const keys = createLocalJWKSet({ keys: [jwk] });
    const sign = (
      claims: Record<string, unknown>,
      opts: { aud?: string; iss?: string; exp?: string } = {},
    ) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(opts.iss ?? 'https://accounts.google.com')
        .setAudience(opts.aud ?? 'client-1')
        .setSubject('g-123')
        .setIssuedAt()
        .setExpirationTime(opts.exp ?? '5m')
        .sign(privateKey);
    const good = await sign({ email: 'a@example.test', email_verified: true, name: 'A' });
    expect(await verifyGoogleIdToken(good, 'client-1', keys)).toEqual({
      provider: 'google',
      providerAccountId: 'g-123',
      type: 'oidc',
      email: 'a@example.test',
      emailVerified: true,
      name: 'A',
      image: null,
    });
    expect(await verifyGoogleIdToken(good, 'client-2', keys)).toBeNull();
    expect(
      await verifyGoogleIdToken(await sign({}, { iss: 'https://evil.test' }), 'client-1', keys),
    ).toBeNull();
    expect(await verifyGoogleIdToken(await sign({}, { exp: '-1m' }), 'client-1', keys)).toBeNull();
    const other = await generateKeyPair('RS256');
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer('https://accounts.google.com')
      .setAudience('client-1')
      .setSubject('g-123')
      .setExpirationTime('5m')
      .sign(other.privateKey);
    expect(await verifyGoogleIdToken(forged, 'client-1', keys)).toBeNull();
  });
});

describe('sign-in configuration', () => {
  it('enables providers from config only when configured', () => {
    const r = resolve({
      NODE_ENV: 'production',
      AUTH_PROVIDERS: 'google,github,email',
      AUTH_GOOGLE_ID: 'gid',
      AUTH_GOOGLE_SECRET: 'gs',
      AUTH_EMAIL_SERVER: 'smtp://u:p@mail.example.test:587',
      AUTH_EMAIL_FROM: 'AskCalls <no-reply@example.test>',
    });
    expect(enabledProviders(r).map((p) => p.id)).toEqual([
      'google',
      'google-one-tap',
      'nodemailer',
    ]);
  });

  it('never enables the test provider in production or on the hosted instance', () => {
    expect(
      testProviderEnabled(resolve({ NODE_ENV: 'production', AUTH_TEST_PROVIDER: 'true' })),
    ).toBe(false);
    expect(testProviderEnabled(resolve({ NODE_ENV: 'development' }))).toBe(false);
    expect(
      testProviderEnabled(resolve({ NODE_ENV: 'development', AUTH_TEST_PROVIDER: 'true' })),
    ).toBe(true);
    expect(testProviderEnabled(resolve({ NODE_ENV: 'test' }))).toBe(true);
    expect(testProviderEnabled(resolve({ NODE_ENV: 'test', ASKCALLS_HOSTED: 'true' }))).toBe(false);
  });

  it('builds a JWT config with the redirect proxy for previews', () => {
    const config = resolve({
      NODE_ENV: 'test',
      AUTH_SECRET: 's'.repeat(32),
      AUTH_REDIRECT_PROXY_URL: 'https://dev.example.test/api/auth',
    });
    const auth = buildAuthConfig({ config, ports: makeTestPorts(), close: async () => {} });
    expect(auth.session?.strategy).toBe('jwt');
    expect(auth.redirectProxyUrl).toBe('https://dev.example.test/api/auth');
    const ids = auth.providers.map((p) => {
      const provider = typeof p === 'function' ? p() : p;
      return (provider as { options?: { id?: string } }).options?.id ?? provider.id;
    });
    expect(ids).toEqual(['test']);
  });

  it('has no session secret in production without AUTH_SECRET', async () => {
    const prod = resolve({ NODE_ENV: 'production' });
    expect(authSecret(prod)).toBeNull();
    const dev = resolve({ NODE_ENV: 'development' });
    const secret = authSecret(dev)!;
    expect(secret.length).toBeGreaterThan(30);
    const jwt = await encode({ token: { sub: 'u1' }, secret, salt: 'authjs.session-token' });
    const headers = new Headers({ cookie: `authjs.session-token=${jwt}` });
    expect(await readSessionUserId(headers, dev)).toBe('u1');
    expect(await readSessionUserId(headers, prod)).toBeNull();
  });
});
