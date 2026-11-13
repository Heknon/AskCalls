import type { Page } from '../entities/common';
import { DomainError } from '../entities/errors';
import type { Plan, User, UserRole } from '../entities/user';
import {
  effectiveLimits,
  LIMIT_FIELDS,
  type LimitField,
  type LimitOverrides,
  type Limits,
  MAX_LIMIT_VALUE,
} from '../limits';
import type { Ports } from '../ports-bundle';
import { type Actor, audit, requireSession, requireUser } from './context';
import { type AccountUsage, accountUsage } from './limits';

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

export interface AccountSummary {
  id: string;
  email: string | null;
  name: string | null;
  plan: Plan;
  role: UserRole;
  createdAt: Date;
  /** Fields with an override, in `LIMIT_FIELDS` order. */
  overridden: LimitField[];
  usage: AccountUsage;
}

export interface AccountDetail extends AccountSummary {
  /** Instance limits with this account's overrides applied. */
  limits: Limits;
  instanceLimits: Limits;
  overrides: LimitOverrides;
}

export const ACCOUNT_PAGE_MAX = 100;

function summarize(user: User, usage: AccountUsage): AccountSummary {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    role: user.role,
    createdAt: user.createdAt,
    overridden: LIMIT_FIELDS.filter((f) => user.limitOverrides[f] !== undefined),
    usage,
  };
}

/** Accounts with their usage, newest first. Counts and sizes only: no call or tag data. */
export async function listAccounts(
  ports: Ports,
  actor: Actor,
  input: { email?: string; cursor?: string | null; limit?: number },
): Promise<Page<AccountSummary>> {
  await requireAdmin(ports, actor);
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > ACCOUNT_PAGE_MAX) {
    throw new DomainError('invalid', 'limit must be 1..100');
  }
  const email = input.email?.trim().toLowerCase();
  const page = await ports.users.list({
    limit,
    cursor: input.cursor ?? null,
    ...(email && { email }),
  });
  const now = ports.clock.now();
  const items = await Promise.all(
    page.items.map(async (u) => summarize(u, await accountUsage(ports, u.id, now))),
  );
  return { items, nextCursor: page.nextCursor };
}

async function requireAccount(ports: Pick<Ports, 'users'>, userId: string): Promise<User> {
  const user = await ports.users.findById(userId);
  if (!user || user.deletedAt) throw new DomainError('not_found', 'account not found');
  return user;
}

async function detail(ports: Ports, user: User): Promise<AccountDetail> {
  const usage = await accountUsage(ports, user.id, ports.clock.now());
  return {
    ...summarize(user, usage),
    limits: effectiveLimits(ports.limits, user.limitOverrides),
    instanceLimits: ports.limits,
    overrides: user.limitOverrides,
  };
}

export async function getAccount(
  ports: Ports,
  actor: Actor,
  userId: string,
): Promise<AccountDetail> {
  await requireAdmin(ports, actor);
  return detail(ports, await requireAccount(ports, userId));
}

/** A value per field to override, `null` to fall back to the instance limit. Absent: unchanged. */
export type LimitOverridePatch = Partial<Record<LimitField, number | null>>;

/** Sets or clears an account's limit overrides. Audited on both accounts: field names only. */
export async function updateAccountLimits(
  ports: Ports,
  actor: Actor,
  userId: string,
  patch: LimitOverridePatch,
): Promise<AccountDetail> {
  const admin = await requireAdmin(ports, actor);
  const target = await requireAccount(ports, userId);
  const next: LimitOverrides = { ...target.limitOverrides };
  const changed: LimitField[] = [];
  for (const f of LIMIT_FIELDS) {
    const v = patch[f];
    if (v === undefined) continue;
    if (v !== null && (!Number.isSafeInteger(v) || v < 0 || v > MAX_LIMIT_VALUE)) {
      throw new DomainError('invalid', 'limits must be whole numbers from 0', { field: f });
    }
    if ((next[f] ?? null) === v) continue;
    if (v === null) delete next[f];
    else next[f] = v;
    changed.push(f);
  }
  if (!changed.length) return detail(ports, target);
  await ports.users.setLimitOverrides(target.id, next);
  const fields = changed.join(',');
  await audit(ports, actor, target.id, 'limits.update', null, { by: admin.id, fields });
  if (admin.id !== target.id) {
    await audit(ports, actor, admin.id, 'limits.update', null, { userId: target.id, fields });
  }
  return detail(ports, { ...target, limitOverrides: next });
}
