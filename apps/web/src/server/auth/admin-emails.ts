import type { User, UserRepository } from '@askcalls/domain';

/**
 * `ADMIN_EMAILS` set: a user is an admin exactly when their sign-in email is listed. The role is
 * derived on every read, so removing an email takes effect on the next request, and the stored
 * role (first-user rule, promotion) is ignored.
 */
export function withAdminEmails(users: UserRepository, emails: readonly string[]): UserRepository {
  const admins = new Set(emails.map((e) => e.trim().toLowerCase()));
  const withRole = <T extends User | null>(u: T): T => {
    if (!u) return u;
    u.role = u.email && admins.has(u.email.toLowerCase()) ? 'admin' : 'user';
    return u;
  };
  const overrides: Partial<UserRepository> = {
    create: async (input) => withRole(await users.create(input)),
    findById: async (id) => withRole(await users.findById(id)),
    findByEmail: async (email) => withRole(await users.findByEmail(email)),
    findByAccount: async (provider, id) => withRole(await users.findByAccount(provider, id)),
    update: async (id, patch) => withRole(await users.update(id, patch)),
    list: async (opts) => {
      const page = await users.list(opts);
      return { ...page, items: page.items.map(withRole) };
    },
    setRole: async () => {},
  };
  return new Proxy(users, {
    get(target, prop) {
      if (prop in overrides) return overrides[prop as keyof UserRepository];
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** The users port as the instance config wants it: wrapped only when `ADMIN_EMAILS` is set. */
export function usersFor(users: UserRepository, adminEmails: readonly string[]): UserRepository {
  return adminEmails.length ? withAdminEmails(users, adminEmails) : users;
}
