import { isDomainError, type Ports, type SignInPasskey, type User } from '@askcalls/domain';
import type { Adapter, AdapterAuthenticator, AdapterUser } from 'next-auth/adapters';

/**
 * Auth.js adapter over the UserRepository port (users, linked accounts, verification tokens).
 * Sessions are JWTs, so no session methods. OAuth access, refresh and ID tokens are dropped:
 * a linked account stores only provider, account id and type.
 */
export function toAdapterUser(u: User): AdapterUser {
  return { id: u.id, email: u.email ?? '', emailVerified: null, name: u.name, image: u.image };
}

/** The first user on an instance becomes its admin (spec 11.2b). */
export async function createUserWithRole(
  ports: Pick<Ports, 'users' | 'telemetry'>,
  input: { email: string | null; name?: string | null; image?: string | null },
): Promise<User> {
  const first = (await ports.users.count()) === 0;
  const user = await ports.users.create({
    email: input.email ? input.email.toLowerCase() : null,
    name: input.name ?? null,
    image: input.image ?? null,
  });
  if (first) {
    await ports.users.setRole(user.id, 'admin');
    user.role = 'admin';
  }
  // Operator telemetry: an id-free counter event. Product events need consent, which a brand
  // new account has not given, so nothing user-linked is sent.
  ports.telemetry.event(null, { name: 'sign_up' });
  return user;
}

const toAuthenticator = (p: SignInPasskey): AdapterAuthenticator => ({
  credentialID: p.credentialId,
  userId: p.userId,
  providerAccountId: p.providerAccountId,
  credentialPublicKey: p.publicKey,
  counter: p.counter,
  credentialDeviceType: p.deviceType,
  credentialBackedUp: p.backedUp,
  ...(p.transports ? { transports: p.transports } : {}),
});

export function createAuthAdapter(
  ports: Pick<Ports, 'users' | 'telemetry' | 'localCredentials'>,
): Adapter {
  const { users, localCredentials } = ports;
  return {
    async createUser(u) {
      return toAdapterUser(
        await createUserWithRole(ports, { email: u.email || null, name: u.name, image: u.image }),
      );
    },
    async getUser(id) {
      const u = await users.findById(id);
      return u && !u.deletedAt ? toAdapterUser(u) : null;
    },
    async getUserByEmail(email) {
      const u = await users.findByEmail(email.toLowerCase());
      return u && !u.deletedAt ? toAdapterUser(u) : null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const u = await users.findByAccount(provider, providerAccountId);
      return u && !u.deletedAt ? toAdapterUser(u) : null;
    },
    async updateUser(u) {
      const patch: { name?: string | null; image?: string | null } = {};
      if (u.name !== undefined) patch.name = u.name;
      if (u.image !== undefined) patch.image = u.image;
      return toAdapterUser(await users.update(u.id, patch));
    },
    async deleteUser(id) {
      await users.deleteHard(id);
    },
    async linkAccount(a) {
      try {
        await users.linkAccount({
          userId: a.userId,
          provider: a.provider,
          providerAccountId: a.providerAccountId,
          type: a.type,
        });
      } catch (e) {
        // Already linked to this user: linking is idempotent.
        if (!(isDomainError(e) && e.code === 'conflict')) throw e;
        const owner = await users.findByAccount(a.provider, a.providerAccountId);
        if (owner?.id !== a.userId) throw e;
      }
    },
    async unlinkAccount({ provider, providerAccountId }) {
      await users.unlinkAccount(provider, providerAccountId);
    },
    async createVerificationToken(t) {
      await users.createVerificationToken({
        identifier: t.identifier,
        token: t.token,
        expires: t.expires,
      });
      return t;
    },
    async useVerificationToken({ identifier, token }) {
      return users.useVerificationToken(identifier, token);
    },
    async getAccount(providerAccountId, provider) {
      const u = await users.findByAccount(provider, providerAccountId);
      if (!u || u.deletedAt) return null;
      return { userId: u.id, provider, providerAccountId, type: 'webauthn' };
    },
    // Sign-in passkeys (Auth.js WebAuthn), for local accounts.
    async createAuthenticator(a) {
      await localCredentials.addPasskey({
        credentialId: a.credentialID,
        userId: a.userId,
        providerAccountId: a.providerAccountId,
        publicKey: a.credentialPublicKey,
        counter: a.counter,
        deviceType: a.credentialDeviceType,
        backedUp: a.credentialBackedUp,
        transports: a.transports ?? null,
      });
      return a;
    },
    async getAuthenticator(credentialID) {
      const p = await localCredentials.getPasskey(credentialID);
      return p ? toAuthenticator(p) : null;
    },
    async listAuthenticatorsByUserId(userId) {
      return (await localCredentials.listPasskeys(userId)).map(toAuthenticator);
    },
    async updateAuthenticatorCounter(credentialID, counter) {
      await localCredentials.updatePasskeyCounter(credentialID, counter);
      const p = await localCredentials.getPasskey(credentialID);
      if (!p) throw new Error('authenticator not found');
      return toAuthenticator(p);
    },
  };
}

export interface ExternalIdentity {
  provider: string;
  providerAccountId: string;
  type: 'oidc' | 'oauth' | 'email';
  email: string | null;
  /** Only a verified email may attach this identity to an existing account. */
  emailVerified: boolean;
  name: string | null;
  image: string | null;
}

/**
 * Sign-in for Credentials-style providers (Google One Tap, the e2e test provider), which Auth.js
 * doesn't route through the adapter: finds the linked user, else links a verified email's user,
 * else creates one.
 */
export async function findOrCreateUser(
  ports: Pick<Ports, 'users' | 'telemetry'>,
  id: ExternalIdentity,
): Promise<User> {
  const linked = await ports.users.findByAccount(id.provider, id.providerAccountId);
  if (linked && !linked.deletedAt) return linked;
  const email = id.email?.toLowerCase() ?? null;
  let user = email && id.emailVerified ? await ports.users.findByEmail(email) : null;
  if (user?.deletedAt) user = null;
  if (!user) {
    if (email && (await ports.users.findByEmail(email))) {
      // An account with this address exists but the address isn't verified by this provider.
      throw new Error('OAuthAccountNotLinked');
    }
    user = await createUserWithRole(ports, { email, name: id.name, image: id.image });
  }
  await ports.users.linkAccount({
    userId: user.id,
    provider: id.provider,
    providerAccountId: id.providerAccountId,
    type: id.type,
  });
  return user;
}
