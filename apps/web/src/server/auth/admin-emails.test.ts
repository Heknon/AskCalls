import { requireAdmin } from '@askcalls/domain/use-cases/admin';
import { describe, expect, it } from 'vitest';
import { session } from '../testing/fixtures';
import { sessionCookie, startTestApp } from '../testing/http';

describe('ADMIN_EMAILS', () => {
  it('makes exactly the listed accounts admins, whatever the stored role', async () => {
    const app = startTestApp({ env: { ADMIN_EMAILS: 'Boss@Example.test' } });
    try {
      const first = await app.ports.users.create({ email: 'first@example.test' });
      await app.ports.users.setRole(first.id, 'admin');
      const boss = await app.ports.users.create({ email: 'boss@example.test' });
      expect(boss.role).toBe('admin');
      expect((await app.ports.users.findById(first.id))?.role).toBe('user');

      await expect(requireAdmin(app.ports, session(first.id))).rejects.toMatchObject({
        code: 'forbidden',
      });
      await expect(requireAdmin(app.ports, session(boss.id))).resolves.toMatchObject({
        id: boss.id,
      });

      const asBoss = { cookie: await sessionCookie(boss.id) };
      const me = (await (await app.req('GET', '/api/me', { as: asBoss })).json()) as {
        user: { role: string };
      };
      expect(me.user.role).toBe('admin');
      const promote = await app.req('POST', '/api/admin/users', {
        as: asBoss,
        json: { email: 'first@example.test' },
      });
      expect(promote.status).toBe(403);
    } finally {
      app.close();
    }
  });

  it('keeps the stored role when unset', async () => {
    const app = startTestApp();
    try {
      const u = await app.ports.users.create({ email: 'a@example.test' });
      await app.ports.users.setRole(u.id, 'admin');
      expect((await app.ports.users.findById(u.id))?.role).toBe('admin');
    } finally {
      app.close();
    }
  });
});
