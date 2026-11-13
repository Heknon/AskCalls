import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SignInPasskey } from '../../src/entities/user';
import type { LocalCredentialRepository } from '../../src/ports/repositories';
import type { Harness } from './helpers';

interface Scoped {
  store: LocalCredentialRepository;
  userA: string;
  userB: string;
}

const passkey = (userId: string, credentialId: string): SignInPasskey => ({
  credentialId,
  userId,
  providerAccountId: credentialId,
  publicKey: 'pQECAyYgASFYIA',
  counter: 0,
  deviceType: 'singleDevice',
  backedUp: false,
  transports: 'internal',
});

export function describeLocalCredentialRepositoryContract(name: string, harness: Harness<Scoped>) {
  describe(`LocalCredentialRepository contract: ${name}`, () => {
    let s: Scoped;
    beforeEach(async () => {
      s = await harness.setup();
    });
    afterEach(async () => harness.teardown?.(s));

    it('stores one password hash per user and replaces it', async () => {
      expect(await s.store.getPasswordHash(s.userA)).toBeNull();
      await s.store.setPasswordHash(s.userA, '$argon2id$v=19$m=19456,t=2,p=1$a$b');
      await s.store.setPasswordHash(s.userA, '$argon2id$v=19$m=19456,t=2,p=1$c$d');
      expect(await s.store.getPasswordHash(s.userA)).toBe('$argon2id$v=19$m=19456,t=2,p=1$c$d');
      expect(await s.store.getPasswordHash(s.userB)).toBeNull();
    });

    it('registers passkeys, finds them by credential id and lists them per user', async () => {
      await s.store.addPasskey(passkey(s.userA, 'cred-a1'));
      await s.store.addPasskey(passkey(s.userA, 'cred-a2'));
      await s.store.addPasskey(passkey(s.userB, 'cred-b1'));
      expect(await s.store.getPasskey('cred-a2')).toEqual(passkey(s.userA, 'cred-a2'));
      expect(await s.store.getPasskey('missing')).toBeNull();
      expect((await s.store.listPasskeys(s.userA)).map((p) => p.credentialId).sort()).toEqual([
        'cred-a1',
        'cred-a2',
      ]);
      expect((await s.store.listPasskeys(s.userB)).map((p) => p.credentialId)).toEqual([
        'cred-b1',
      ]);
    });

    it('rejects a credential id registered twice', async () => {
      await s.store.addPasskey(passkey(s.userA, 'cred-dup'));
      await expect(s.store.addPasskey(passkey(s.userB, 'cred-dup'))).rejects.toMatchObject({
        code: 'conflict',
      });
    });

    it('updates the signature counter', async () => {
      await s.store.addPasskey(passkey(s.userA, 'cred-c'));
      await s.store.updatePasskeyCounter('cred-c', 7);
      expect((await s.store.getPasskey('cred-c'))?.counter).toBe(7);
    });
  });
}
