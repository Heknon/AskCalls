import { DAY_MS } from '../entities/common';
import { DomainError } from '../entities/errors';
import { API_SCOPES, type ApiScope, type ApiToken } from '../entities/other';
import type { User } from '../entities/user';
import type { Ports } from '../ports-bundle';
import { type Actor, audit, base64url, randomBytes, requireSession, sha256 } from './context';
import { limitsFor } from './limits';

/** `ac_` + base64url(32 random bytes). Only its sha256 is stored. */
export const TOKEN_PREFIX = 'ac_';
const TOKEN_PATTERN = /^ac_[A-Za-z0-9_-]{43}$/;
const TOUCH_EVERY_MS = 60_000;

export const TOKEN_LIMITS = { nameLength: 100, maxExpiryDays: 365 } as const;

export type ApiTokenOut = Omit<ApiToken, 'tokenHash' | 'userId'>;

const strip = ({ tokenHash: _h, userId: _u, ...t }: ApiToken): ApiTokenOut => t;

export const hashToken = (token: string) => sha256(new TextEncoder().encode(token));

export function looksLikeApiToken(s: string): boolean {
  return TOKEN_PATTERN.test(s);
}

export interface CreateTokenInput {
  name: string;
  scopes: ApiScope[];
  /** Null: never expires. */
  expiresInDays: number | null;
}

/** Creates a personal access token. The token string is returned once and never stored. */
export async function createApiToken(
  ports: Ports,
  actor: Actor,
  input: CreateTokenInput,
): Promise<{ token: string; record: ApiTokenOut }> {
  requireSession(actor);
  const userId = actor.userId;
  if (!input.name.trim() || input.name.length > TOKEN_LIMITS.nameLength) {
    throw new DomainError('invalid', 'name must be 1..100 characters');
  }
  const scopes = [...new Set(input.scopes)];
  if (!scopes.length || !scopes.every((s) => API_SCOPES.includes(s))) {
    throw new DomainError('invalid', 'choose at least one valid scope');
  }
  if (
    input.expiresInDays !== null &&
    (!Number.isInteger(input.expiresInDays) ||
      input.expiresInDays < 1 ||
      input.expiresInDays > TOKEN_LIMITS.maxExpiryDays)
  ) {
    throw new DomainError('invalid', 'expiry must be 1..365 days or never');
  }
  const now = ports.clock.now();
  const [active, { maxApiTokens }] = await Promise.all([
    ports.apiTokens.countActive(userId, now),
    limitsFor(ports, userId),
  ]);
  if (active >= maxApiTokens) {
    throw new DomainError('quota_exceeded', 'token limit reached', {
      limit: maxApiTokens,
      quota: 'api_tokens',
    });
  }
  const token = `${TOKEN_PREFIX}${base64url(randomBytes(32))}`;
  const record = await ports.apiTokens.create({
    id: ports.ids.randomId(),
    userId,
    name: input.name,
    tokenHash: await hashToken(token),
    scopes,
    expiresAt:
      input.expiresInDays === null ? null : new Date(now.getTime() + input.expiresInDays * DAY_MS),
  });
  await audit(ports, actor, userId, 'token.create', null, {
    tokenId: record.id,
    scopes: scopes.join(','),
  });
  return { token, record: strip(record) };
}

const HOUR_MS = 3_600_000;

/** Tokens with `fetchesThisHour`: ciphertext fetches in the current hourly window (spec 12). */
export async function listApiTokens(
  ports: Ports,
  actor: Actor,
): Promise<Array<ApiTokenOut & { fetchesThisHour: number }>> {
  requireSession(actor);
  const now = ports.clock.now().getTime();
  return (await ports.apiTokens.list(actor.userId)).map(({ fetchWindow, ...t }) => ({
    ...strip(t),
    fetchesThisHour:
      fetchWindow && now - fetchWindow.start.getTime() < HOUR_MS ? fetchWindow.count : 0,
  }));
}

export async function revokeApiToken(ports: Ports, actor: Actor, id: string): Promise<void> {
  requireSession(actor);
  const userId = actor.userId;
  const token = (await ports.apiTokens.list(userId)).find((t) => t.id === id);
  if (!token) throw new DomainError('not_found', 'token not found');
  if (!token.revokedAt) await ports.apiTokens.revoke(userId, id, ports.clock.now());
  await audit(ports, actor, userId, 'token.revoke', null, { tokenId: id });
}

/**
 * Resolves a bearer token to its actor: format, hash lookup, revocation, expiry and owner
 * checks, then records its use (at most once a minute). Every failure is `unauthorized`.
 */
export async function authenticateApiToken(
  ports: Ports,
  raw: string,
): Promise<{ token: ApiTokenOut; user: User }> {
  const fail = () => new DomainError('unauthorized', 'invalid or expired token');
  if (!looksLikeApiToken(raw)) throw fail();
  const token = await ports.apiTokens.findByHash(await hashToken(raw));
  const now = ports.clock.now();
  if (!token || token.revokedAt || (token.expiresAt && token.expiresAt <= now)) throw fail();
  const user = await ports.users.findById(token.userId);
  if (!user || user.deletedAt) throw fail();
  if (!token.lastUsedAt || now.getTime() - token.lastUsedAt.getTime() >= TOUCH_EVERY_MS) {
    await ports.apiTokens.touch(token.userId, token.id, now);
  }
  return { token: strip(token), user };
}

export function hasScope(actor: Actor, scope: ApiScope): boolean {
  return actor.kind === 'session' || actor.scopes.includes(scope);
}
