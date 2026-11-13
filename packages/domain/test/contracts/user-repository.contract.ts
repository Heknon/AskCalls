import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { UserRepository } from '../../src/ports/repositories';
import type { Harness } from './helpers';

export function describeUserRepositoryContract(name: string, harness: Harness<UserRepository>) {
  describe(`UserRepository contract: ${name}`, () => {
    let users: UserRepository;
    beforeEach(async () => {
      users = await harness.setup();
    });
    afterEach(async () => {
      await harness.teardown?.(users);
    });

    it('creates users with free plan, user role and no retention', async () => {
      const u = await users.create({ email: 'a@example.test', name: 'A' });
      expect(u.plan).toBe('free');
      expect(u.role).toBe('user');
      expect(u.retentionDays).toBeNull();
      expect(u.telemetryConsent).toEqual({ productEvents: false, errorReports: false });
      expect((await users.findById(u.id))?.email).toBe('a@example.test');
      expect((await users.findByEmail('a@example.test'))?.id).toBe(u.id);
      expect(await users.count()).toBe(1);
    });

    it('updates settings, plan and role', async () => {
      const u = await users.create({ email: 'b@example.test' });
      await users.update(u.id, {
        locale: 'he',
        retentionDays: 30,
        telemetryConsent: { productEvents: true, errorReports: false },
      });
      await users.setPlan(u.id, 'pro');
      await users.setRole(u.id, 'admin');
      const got = await users.findById(u.id);
      expect(got).toMatchObject({ locale: 'he', retentionDays: 30, plan: 'pro', role: 'admin' });
      expect(await users.listWithRetention()).toEqual([{ id: u.id, retentionDays: 30 }]);
    });

    it('links accounts and finds users by them', async () => {
      const u = await users.create({ email: 'd@example.test' });
      await users.linkAccount({
        userId: u.id,
        provider: 'google',
        providerAccountId: 'g-1',
        type: 'oidc',
      });
      expect((await users.findByAccount('google', 'g-1'))?.id).toBe(u.id);
      expect(await users.findByAccount('github', 'g-1')).toBeNull();
      await expect(
        users.linkAccount({
          userId: u.id,
          provider: 'google',
          providerAccountId: 'g-1',
          type: 'oidc',
        }),
      ).rejects.toMatchObject({ code: 'conflict' });
      expect(await users.listAccounts(u.id)).toHaveLength(1);
      const other = await users.create({ email: `other-${u.id}@example.test` });
      await users.unlinkAccount(other.id, 'google', 'g-1');
      expect((await users.findByAccount('google', 'g-1'))?.id).toBe(u.id);
      await users.unlinkAccount(u.id, 'google', 'g-1');
      expect(await users.findByAccount('google', 'g-1')).toBeNull();
    });

    it('uses verification tokens once', async () => {
      const expires = new Date(Date.now() + 600_000);
      await users.createVerificationToken({
        identifier: 'e@example.test',
        token: 'hashed',
        expires,
      });
      expect(await users.useVerificationToken('e@example.test', 'wrong')).toBeNull();
      expect(await users.useVerificationToken('e@example.test', 'hashed')).toEqual({
        identifier: 'e@example.test',
        token: 'hashed',
        expires,
      });
      expect(await users.useVerificationToken('e@example.test', 'hashed')).toBeNull();
    });

    it('deletes hard', async () => {
      const u = await users.create({ email: 'c@example.test' });
      await users.linkAccount({
        userId: u.id,
        provider: 'github',
        providerAccountId: 'h-1',
        type: 'oauth',
      });
      await users.deleteHard(u.id);
      expect(await users.findById(u.id)).toBeNull();
      expect(await users.findByAccount('github', 'h-1')).toBeNull();
    });
  });
}
