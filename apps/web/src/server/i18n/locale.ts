import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import { LOCALE_COOKIE, type Locale } from '../../i18n/locales';
import { resolveLocale } from '../../i18n/resolve';
import { readSessionUserId } from '../auth/secret';
import { getContainer } from '../container';

/** The signed-in user's saved language, or null (signed out, no setting, instance down). */
async function accountLocale(h: Headers): Promise<string | null> {
  if (!h.get('cookie')?.includes('authjs.session-token')) return null;
  try {
    const { config, ports } = await getContainer();
    const userId = await readSessionUserId(h, config);
    return userId ? ((await ports.users.findById(userId))?.locale ?? null) : null;
  } catch {
    return null;
  }
}

/** This request's UI locale (spec 4), resolved once per request. */
export const requestLocale = cache(async (): Promise<Locale> => {
  const [h, c] = await Promise.all([headers(), cookies()]);
  return resolveLocale({
    account: await accountLocale(h),
    cookie: c.get(LOCALE_COOKIE)?.value,
    acceptLanguage: h.get('accept-language'),
  });
});
