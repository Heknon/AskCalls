import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { KeyringRepository } from '../../src/ports/repositories';
import { type Harness, rand, testId } from './helpers';

export interface KeyringSubject {
  keyring: KeyringRepository;
  userA: string;
  userB: string;
}

export function describeKeyringRepositoryContract(name: string, harness: Harness<KeyringSubject>) {
  describe(`KeyringRepository contract: ${name}`, () => {
    let s: KeyringSubject;
    beforeEach(async () => {
      s = await harness.setup();
    });
    afterEach(async () => {
      await harness.teardown?.(s);
    });

    it('adds, lists, gets and revokes entries per user', async () => {
      const entry = await s.keyring.add({
        id: testId(),
        userId: s.userA,
        kind: 'passkey',
        label: 'MacBook',
        credentialId: 'cred-1',
        wrappedRootKey: rand(61),
        kdfParams: { prfSalt: 'abc' },
      });
      expect((await s.keyring.list(s.userA)).map((e) => e.id)).toEqual([entry.id]);
      expect(await s.keyring.get(s.userB, entry.id)).toBeNull();
      expect((await s.keyring.get(s.userA, entry.id))?.wrappedRootKey).toEqual(
        entry.wrappedRootKey,
      );
      await s.keyring.revoke(s.userB, entry.id, new Date());
      expect(await s.keyring.list(s.userA)).toHaveLength(1);
      await s.keyring.revoke(s.userA, entry.id, new Date());
      expect(await s.keyring.list(s.userA)).toHaveLength(0);
      const all = await s.keyring.list(s.userA, { includeRevoked: true });
      expect(all[0]?.revokedAt).toBeInstanceOf(Date);
      expect(all[0]?.wrappedRootKey.length).toBe(0);
    });

    it('stores user keys and devices', async () => {
      await s.keyring.putUserKeys({
        userId: s.userA,
        inboxPublicKey: rand(91),
        inboxPrivateKeyCt: rand(150),
        keyVersion: 1,
      });
      expect((await s.keyring.getUserKeys(s.userA))?.keyVersion).toBe(1);
      expect(await s.keyring.getUserKeys(s.userB)).toBeNull();
      const d = await s.keyring.addDevice({
        id: testId(),
        userId: s.userA,
        label: 'agent',
        signingPublicKey: rand(91),
      });
      expect(await s.keyring.getDevice(s.userB, d.id)).toBeNull();
      await s.keyring.revokeDevice(s.userA, d.id, new Date());
      expect((await s.keyring.getDevice(s.userA, d.id))?.revokedAt).toBeInstanceOf(Date);
    });

    it('runs device-link sessions and expires them', async () => {
      const now = new Date();
      const id = testId();
      await s.keyring.createLinkSession({
        id,
        userId: s.userA,
        secretHash: rand(32),
        state: 'waiting_for_device',
        devicePublicKey: null,
        deviceLabel: null,
        encryptedRootKey: null,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 600_000),
      });
      const pub = rand(91);
      await s.keyring.updateLinkSession(id, {
        state: 'waiting_for_confirmation',
        devicePublicKey: pub,
        deviceLabel: 'laptop',
      });
      expect((await s.keyring.getLinkSession(id))?.devicePublicKey).toEqual(pub);
      expect(await s.keyring.deleteExpiredLinkSessions(new Date(now.getTime() + 601_000))).toBe(1);
      expect(await s.keyring.getLinkSession(id)).toBeNull();
    });
  });
}
