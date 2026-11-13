import { describe, expect, it } from 'vitest';
import { makeTestPorts } from '../testing/ports';
import { createAuthAdapter } from './adapter';
import { passwordSignIn, passwordSignUp } from './local-accounts';
import { hashPassword, verifyPassword } from './password';

describe('local accounts: password', () => {
  it('hashes with Argon2id and a random salt', async () => {
    const a = await hashPassword('correct horse battery');
    const b = await hashPassword('correct horse battery');
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword('correct horse battery', a)).toBe(true);
    expect(await verifyPassword('correct horse batterz', a)).toBe(false);
    expect(await verifyPassword('anything', null)).toBe(false);
  });

  it('signs up once per address, stores only the hash, and signs in', async () => {
    const ports = makeTestPorts();
    const user = await passwordSignUp(ports, 'Ana@Example.test', 'correct horse battery');
    expect(user?.email).toBe('ana@example.test');
    expect(user?.role).toBe('admin');
    expect(await passwordSignUp(ports, 'ana@example.test', 'another long password')).toBeNull();
    expect(await passwordSignUp(ports, 'bo@example.test', 'short')).toBeNull();
    const stored = ports.db.passwordHashes.get(user!.id)!;
    expect(stored).not.toContain('correct horse');
    expect(ports.db.accounts).toContainEqual({
      userId: user!.id,
      provider: 'password',
      providerAccountId: 'ana@example.test',
      type: 'credentials',
    });
    expect((await passwordSignIn(ports, 'ANA@example.test', 'correct horse battery'))?.id).toBe(
      user!.id,
    );
    expect(await passwordSignIn(ports, 'ana@example.test', 'wrong horse battery')).toBeNull();
    expect(await passwordSignIn(ports, 'nobody@example.test', 'correct horse battery')).toBeNull();
  });

  it('throttles failed guesses per address, not successful sign-ins', async () => {
    const ports = makeTestPorts();
    await passwordSignUp(ports, 'ana@example.test', 'correct horse battery');
    for (let i = 0; i < 12; i++) {
      expect(
        await passwordSignIn(ports, 'ana@example.test', 'correct horse battery'),
      ).not.toBeNull();
    }
    for (let i = 0; i < 10; i++) {
      await passwordSignIn(ports, 'ana@example.test', `guess-${i}-xxxxxx`);
    }
    expect(await passwordSignIn(ports, 'ana@example.test', 'correct horse battery')).toBeNull();
  });
});

describe('local accounts: passkeys through the Auth.js adapter', () => {
  it('stores, finds, lists and counts sign-in passkeys', async () => {
    const ports = makeTestPorts();
    const adapter = createAuthAdapter(ports);
    const user = await adapter.createUser!({
      id: '',
      email: 'pk@example.test',
      emailVerified: null,
    });
    await adapter.linkAccount!({
      userId: user.id,
      provider: 'passkey',
      providerAccountId: 'Y3JlZA==',
      type: 'webauthn',
    });
    await adapter.createAuthenticator!({
      credentialID: 'Y3JlZA==',
      userId: user.id,
      providerAccountId: 'Y3JlZA==',
      credentialPublicKey: 'cHVi',
      counter: 0,
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false,
      transports: 'internal',
    });
    expect(await adapter.getAccount!('Y3JlZA==', 'passkey')).toMatchObject({ userId: user.id });
    expect((await adapter.getAuthenticator!('Y3JlZA=='))?.userId).toBe(user.id);
    expect(await adapter.listAuthenticatorsByUserId!(user.id)).toHaveLength(1);
    expect((await adapter.updateAuthenticatorCounter!('Y3JlZA==', 4)).counter).toBe(4);
    expect(await adapter.getAuthenticator!('bWlzc2luZw==')).toBeNull();
  });
});
