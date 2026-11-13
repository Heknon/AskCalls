import { DomainError, type Ports, type User } from '@askcalls/domain';
import { createUserWithRole } from './adapter';
import { acceptablePassword, hashPassword, verifyPassword } from './password';

/**
 * Local accounts (spec 11.2b): email + password (Argon2id) next to email + passkey (Auth.js
 * WebAuthn). Required in offline mode, where no outside sign-in provider is reachable.
 */

type LocalPorts = Pick<Ports, 'users' | 'telemetry' | 'localCredentials' | 'rateLimiter'>;

const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}$/;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function validEmail(email: string): boolean {
  return EMAIL.test(email);
}

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;
const failureKey = (email: string) => `password-failures:${email}`;
const windowStart = () => new Date(Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS);

/** Ten failed attempts per address per 15 minutes; successful sign-ins don't count. */
async function locked(ports: LocalPorts, email: string): Promise<boolean> {
  return (await ports.rateLimiter.usage(failureKey(email), windowStart())) >= MAX_FAILURES;
}

async function recordFailure(ports: LocalPorts, email: string): Promise<void> {
  await ports.rateLimiter.consume(failureKey(email), windowStart(), 1, null);
}

async function attachPassword(ports: LocalPorts, user: User, email: string, password: string) {
  await ports.localCredentials.setPasswordHash(user.id, await hashPassword(password));
  const linked = await ports.users.findByAccount('password', email);
  if (linked?.id === user.id) return;
  await ports.users.linkAccount({
    userId: user.id,
    provider: 'password',
    providerAccountId: email,
    type: 'credentials',
  });
}

/** Creates an account with a password. Null when the address is taken or the input is invalid. */
export async function passwordSignUp(
  ports: LocalPorts,
  rawEmail: string,
  password: string,
): Promise<User | null> {
  const email = normalizeEmail(rawEmail);
  if (!validEmail(email) || !acceptablePassword(password)) return null;
  if (await locked(ports, email)) return null;
  if (await ports.users.findByEmail(email)) {
    await recordFailure(ports, email);
    return null;
  }
  const user = await createUserWithRole(ports, { email });
  await attachPassword(ports, user, email, password);
  return user;
}

export async function passwordSignIn(
  ports: LocalPorts,
  rawEmail: string,
  password: string,
): Promise<User | null> {
  const email = normalizeEmail(rawEmail);
  if (!validEmail(email) || password.length > 256) return null;
  if (await locked(ports, email)) return null;
  const user = await ports.users.findByEmail(email);
  const live = user && !user.deletedAt ? user : null;
  const hash = live ? await ports.localCredentials.getPasswordHash(live.id) : null;
  if (await verifyPassword(password, hash)) return live;
  await recordFailure(ports, email);
  return null;
}

/**
 * The wizard's last step: the admin account, created in the new database before setup is
 * committed. A password is optional; without one the admin adds a passkey once signed in.
 */
export async function createSetupAdmin(
  ports: LocalPorts,
  rawEmail: string,
  password: string | null,
): Promise<User> {
  const email = normalizeEmail(rawEmail);
  if (!validEmail(email)) throw new DomainError('invalid', 'enter a valid email address');
  if (password !== null && !acceptablePassword(password)) {
    throw new DomainError('invalid', 'the password is too short');
  }
  const existing = await ports.users.findByEmail(email);
  let user: User;
  if (existing) {
    user = existing;
  } else {
    user = await ports.users.create({ email });
    ports.telemetry.event(null, { name: 'sign_up' });
  }
  await ports.users.setRole(user.id, 'admin');
  user.role = 'admin';
  if (password !== null) await attachPassword(ports, user, email, password);
  return user;
}

const CLAIM_PREFIX = 'setup-claim:';

async function sha256Hex(s: string): Promise<string> {
  const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A one-time, 10-minute sign-in for the admin the wizard just created, so the browser that ran
 * setup is signed in without a second step. Only its SHA-256 is stored.
 */
export async function issueSetupClaim(ports: Pick<Ports, 'users'>, userId: string) {
  const secret = btoa(
    String.fromCharCode(...globalThis.crypto.getRandomValues(new Uint8Array(32))),
  ).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
  await ports.users.createVerificationToken({
    identifier: `${CLAIM_PREFIX}${userId}`,
    token: await sha256Hex(secret),
    expires: new Date(Date.now() + 10 * 60_000),
  });
  return `${userId}.${secret}`;
}

export async function redeemSetupClaim(
  ports: Pick<Ports, 'users'>,
  claim: string,
): Promise<User | null> {
  const dot = claim.indexOf('.');
  const valid = dot > 0 && claim.length <= 200;
  const userId = valid ? claim.slice(0, dot) : '';
  const hash = await sha256Hex(valid ? claim.slice(dot + 1) : '');
  // A malformed claim still makes the lookup, under an identifier no claim can have.
  const consume = ports.users.useVerificationToken.bind(ports.users);
  const used = await consume(valid ? `${CLAIM_PREFIX}${userId}` : `${CLAIM_PREFIX}invalid`, hash);
  if (!valid || !used || used.expires.getTime() < Date.now()) return null;
  const user = await ports.users.findById(userId);
  return user && !user.deletedAt ? user : null;
}
