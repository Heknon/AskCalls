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

    it('stores, replaces and clears limit overrides', async () => {
      const u = await users.create({ email: 'limits@example.test' });
      expect(u.limitOverrides).toEqual({});
      await users.setLimitOverrides(u.id, { maxCalls: 2000, recordingBytes: 10 * 1024 ** 3 });
      expect((await users.findById(u.id))?.limitOverrides).toEqual({
        maxCalls: 2000,
        recordingBytes: 10 * 1024 ** 3,
      });
      expect((await users.findByEmail('limits@example.test'))?.limitOverrides.maxCalls).toBe(2000);
      await users.setLimitOverrides(u.id, { asksPerDay: 0 });
      expect((await users.findById(u.id))?.limitOverrides).toEqual({ asksPerDay: 0 });
      await users.setLimitOverrides(u.id, {});
      expect((await users.findById(u.id))?.limitOverrides).toEqual({});
      const other = await users.create({ email: 'limits-other@example.test' });
      await users.setLimitOverrides(u.id, { maxApiTokens: 9 });
      expect((await users.findById(other.id))?.limitOverrides).toEqual({});
    });

    it('lists accounts newest first, by page and by email', async () => {
      const made = [];
      for (const e of [
        'ann@a.test',
        'bob@b.test',
        'Carol@A.test',
        'dan_x@b.test',
        'dan%y@b.test',
      ]) {
        made.push(await users.create({ email: e }));
      }
      await users.setLimitOverrides(made[0]!.id, { maxCalls: 7 });
      const ids = made.map((u) => u.id).reverse();
      const first = await users.list({ limit: 2 });
      expect(first.items.map((u) => u.id)).toEqual(ids.slice(0, 2));
      const second = await users.list({ limit: 2, cursor: first.nextCursor });
      expect(second.items.map((u) => u.id)).toEqual(ids.slice(2, 4));
      const third = await users.list({ limit: 2, cursor: second.nextCursor });
      expect(third.items.map((u) => u.id)).toEqual(ids.slice(4));
      expect(third.nextCursor).toBeNull();
      expect(third.items[0]?.limitOverrides).toEqual({ maxCalls: 7 });

      const byDomain = await users.list({ email: 'a.test', limit: 10 });
      expect(byDomain.items.map((u) => u.email)).toEqual(['Carol@A.test', 'ann@a.test']);
      expect((await users.list({ email: 'dan_', limit: 10 })).items.map((u) => u.email)).toEqual([
        'dan_x@b.test',
      ]);
      expect((await users.list({ email: 'dan%', limit: 10 })).items.map((u) => u.email)).toEqual([
        'dan%y@b.test',
      ]);
      expect((await users.list({ email: 'nobody', limit: 10 })).items).toEqual([]);
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
