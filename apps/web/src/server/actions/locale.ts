'use server';

import { cookies, headers } from 'next/headers';
import { isLocale, LOCALE_COOKIE } from '../../i18n/locales';
import { readSessionUserId } from '../auth/secret';
import { getContainer } from '../container';

const YEAR_SECONDS = 365 * 24 * 3600;

/**
 * Saves the UI language: always in the `locale` cookie (signed-out pages, the next sign-in),
 * and on the account when signed in, so every device follows it.
 */
export async function saveLocale(locale: string): Promise<{ saved: boolean }> {
  if (!isLocale(locale)) return { saved: false };
  const { config, ports } = await getContainer();
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: YEAR_SECONDS,
    sameSite: 'lax',
    secure: config.config.appUrl.startsWith('https:'),
  });
  const userId = await readSessionUserId(await headers(), config);
  if (!userId) return { saved: true };
  const limit = await ports.rateLimiter.hit(`rl:locale:${userId}`, 30, 60_000);
  if (!limit.allowed) return { saved: false };
  await ports.users.update(userId, { locale });
  return { saved: true };
}
