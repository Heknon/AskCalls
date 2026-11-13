import NextAuth from 'next-auth';
import { getContainer } from '../container';
import { buildAuthConfig } from './config';

/**
 * The Auth.js instance. Config is resolved per request from the container, so sign-in methods
 * follow instance config changes without a restart.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(async () =>
  buildAuthConfig(await getContainer()),
);
