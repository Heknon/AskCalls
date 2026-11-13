import type { NextAuthConfig } from 'next-auth';
import type { Provider } from 'next-auth/providers';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import type { ResolvedConfig } from '../config/config-service';
import type { Container } from '../container';
import { createAuthAdapter, findOrCreateUser } from './adapter';
import { verifyGoogleIdToken } from './google-one-tap';
import { authSecret } from './secret';

export interface ProviderInfo {
  id: string;
  kind: 'oauth' | 'email' | 'one-tap' | 'test';
}

/**
 * The e2e sign-in provider: only with NODE_ENV=test, or AUTH_TEST_PROVIDER=true outside
 * production. Never on a production build, never on the hosted instance.
 */
export function testProviderEnabled(resolved: ResolvedConfig): boolean {
  if (resolved.config.hosted || resolved.environment === 'production') return false;
  return resolved.environment === 'test' || resolved.config.auth.testProvider;
}

/** Sign-in methods this instance offers, from config (spec 4, 11.2b). */
export function enabledProviders(resolved: ResolvedConfig): ProviderInfo[] {
  const { auth } = resolved.config;
  const out: ProviderInfo[] = [];
  const wants = new Set(auth.providers);
  if (wants.has('google') && auth.google.id && auth.google.secret) {
    out.push({ id: 'google', kind: 'oauth' });
    if (!resolved.config.offlineMode) out.push({ id: 'google-one-tap', kind: 'one-tap' });
  }
  if (wants.has('github') && auth.github.id && auth.github.secret) {
    out.push({ id: 'github', kind: 'oauth' });
  }
  if (wants.has('email') && auth.email.server && auth.email.from) {
    out.push({ id: 'nodemailer', kind: 'email' });
  }
  if (testProviderEnabled(resolved)) out.push({ id: 'test', kind: 'test' });
  return out;
}

export function buildAuthConfig(container: Container): NextAuthConfig {
  const resolved = container.config;
  const { auth } = resolved.config;
  const { ports } = container;
  const providers: Provider[] = [];
  for (const p of enabledProviders(resolved)) {
    switch (p.id) {
      case 'google':
        providers.push(Google({ clientId: auth.google.id!, clientSecret: auth.google.secret! }));
        break;
      case 'google-one-tap':
        providers.push(
          Credentials({
            id: 'google-one-tap',
            name: 'Google One Tap',
            credentials: { credential: { type: 'text' } },
            async authorize(credentials) {
              const credential = credentials?.credential;
              if (typeof credential !== 'string' || credential.length > 8192) return null;
              const identity = await verifyGoogleIdToken(credential, auth.google.id!);
              if (!identity) return null;
              const user = await findOrCreateUser(ports, identity);
              return { id: user.id, email: user.email, name: user.name, image: user.image };
            },
          }),
        );
        break;
      case 'github':
        providers.push(GitHub({ clientId: auth.github.id!, clientSecret: auth.github.secret! }));
        break;
      case 'nodemailer':
        providers.push(Nodemailer({ server: auth.email.server!, from: auth.email.from! }));
        break;
      case 'test':
        providers.push(
          Credentials({
            id: 'test',
            name: 'Test sign-in',
            credentials: { email: { type: 'email' } },
            async authorize(credentials) {
              const email = credentials?.email;
              if (typeof email !== 'string' || !/^[^@\s]{1,64}@[^@\s]{1,190}$/.test(email)) {
                return null;
              }
              const user = await findOrCreateUser(ports, {
                provider: 'test',
                providerAccountId: email.toLowerCase(),
                type: 'oidc',
                email,
                emailVerified: true,
                name: null,
                image: null,
              });
              return { id: user.id, email: user.email, name: user.name, image: user.image };
            },
          }),
        );
        break;
    }
  }

  return {
    secret: authSecret(resolved) ?? undefined,
    trustHost: true,
    basePath: '/api/auth',
    session: { strategy: 'jwt' },
    adapter: createAuthAdapter(ports),
    providers,
    ...(auth.redirectProxyUrl && { redirectProxyUrl: auth.redirectProxyUrl }),
    pages: { signIn: '/login', error: '/login', verifyRequest: '/login?check=email' },
    // Auth.js logs errors with their causes; keep only the error type, never request data.
    logger: {
      error: (error) => ports.telemetry.error({ code: 'auth', errorName: error.name }),
      warn: () => {},
      debug: () => {},
    },
    callbacks: {
      jwt({ token, user }) {
        if (user?.id) token.sub = user.id;
        // Keep the JWT to the user id: no email, name or picture in the cookie.
        return { sub: token.sub };
      },
      session({ session, token }) {
        if (token.sub) session.user.id = token.sub;
        return session;
      },
    },
  };
}
