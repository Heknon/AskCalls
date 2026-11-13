import { DomainError } from '../entities/errors';
import type { User } from '../entities/user';
import type { Ports } from '../ports-bundle';
import { type Actor, audit, requireSession, requireUser } from './context';

/** Instance administration is browser-session only and needs the admin role (spec 11.2b). */
export async function requireAdmin(ports: Pick<Ports, 'users'>, actor: Actor): Promise<User> {
  requireSession(actor);
  const user = await requireUser(ports, actor.userId);
  if (user.role !== 'admin') throw new DomainError('forbidden', 'requires the admin role');
  return user;
}

export interface PromoteResult {
  userId: string;
  role: 'admin';
  alreadyAdmin: boolean;
}

/** Makes another user an admin, found by their sign-in email. Audited on both accounts. */
export async function promoteUser(
  ports: Pick<Ports, 'users' | 'audit'>,
  actor: Actor,
  email: string,
): Promise<PromoteResult> {
  const admin = await requireAdmin(ports, actor);
  const target = await ports.users.findByEmail(email.trim().toLowerCase());
  if (!target || target.deletedAt) throw new DomainError('not_found', 'no user with that email');
  if (target.role === 'admin') return { userId: target.id, role: 'admin', alreadyAdmin: true };
  await ports.users.setRole(target.id, 'admin');
  await audit(ports, actor, target.id, 'role.grant', null, { by: admin.id, role: 'admin' });
  await audit(ports, actor, admin.id, 'role.grant', null, { userId: target.id, role: 'admin' });
  return { userId: target.id, role: 'admin', alreadyAdmin: false };
}

export interface InstanceUsage {
  users: number;
  /** True when the admin is the only user and holds no calls: the database may be switched. */
  databaseEmpty: boolean;
}

export async function instanceUsage(
  ports: Pick<Ports, 'users' | 'calls'>,
  actor: Actor,
): Promise<InstanceUsage> {
  const admin = await requireAdmin(ports, actor);
  const [users, calls] = await Promise.all([ports.users.count(), ports.calls.count(admin.id)]);
  return { users, databaseEmpty: users <= 1 && calls === 0 };
}

/** Records an instance configuration change on the admin's audit log: paths only, no values. */
export async function auditInstanceUpdate(
  ports: Pick<Ports, 'audit'>,
  actor: Actor,
  paths: string[],
): Promise<void> {
  await audit(ports, actor, actor.userId, 'instance.update', null, {
    paths: paths.slice(0, 20).join(','),
    count: paths.length,
  });
}
