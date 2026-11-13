import { getRequestConfig } from 'next-intl/server';
import { requestLocale } from '../server/i18n/locale';
import { loadMessages } from './messages';

/** next-intl without locale routing: the locale comes from the account, cookie or browser. */
export default getRequestConfig(async () => {
  const locale = await requestLocale();
  return { locale, messages: await loadMessages(locale) };
});
