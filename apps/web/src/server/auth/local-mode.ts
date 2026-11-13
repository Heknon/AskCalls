import type { Ports, User } from '@askcalls/domain';
import { constantTimeEqual } from '@askcalls/domain/use-cases/context';
import type { ResolvedConfig } from '../config/config-service';
import { findOrCreateUser } from './adapter';

/** The linked account that identifies the one user of a local-mode instance (spec 11.2c). */
export const LOCAL_ACCOUNT = { provider: 'askcalls-local', providerAccountId: 'local' } as const;

/** True when `given` is this start's local key (set by `askcalls local`), in constant time. */
export function localKeyMatches(resolved: ResolvedConfig, given: unknown): boolean {
  const { appMode, local } = resolved.config;
  if (appMode !== 'local' || !local.key || typeof given !== 'string') return false;
  const enc = new TextEncoder();
  return constantTimeEqual(enc.encode(given), enc.encode(local.key));
}

/**
 * The single local user, created on the first sign-in after the first start. It owns the
 * computer, so it is always the admin (instance providers, offline mode).
 */
export async function localUser(ports: Pick<Ports, 'users' | 'telemetry'>): Promise<User> {
  const user = await findOrCreateUser(ports, {
    ...LOCAL_ACCOUNT,
    type: 'oidc',
    email: null,
    emailVerified: false,
    name: null,
    image: null,
  });
  if (user.role !== 'admin') {
    await ports.users.setRole(user.id, 'admin');
    user.role = 'admin';
  }
  return user;
}
