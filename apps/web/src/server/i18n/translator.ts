import { createTranslator } from 'next-intl';
import { LOCALE_COOKIE, type Locale, localeDir } from '../../i18n/locales';
import { loadMessages, type Messages, type Namespace } from '../../i18n/messages';
import { resolveLocale } from '../../i18n/resolve';

/**
 * Translations for responses rendered outside React (the CLI hand-off page), with the locale from
 * the request's cookie and Accept-Language.
 */
export async function requestTranslator<N extends Namespace>(req: Request, namespace: N) {
  const cookie = req.headers
    .get('cookie')
    ?.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`))?.[1];
  const locale: Locale = resolveLocale({
    cookie,
    acceptLanguage: req.headers.get('accept-language'),
  });
  const messages: Messages = await loadMessages(locale);
  return {
    locale,
    dir: localeDir(locale),
    t: createTranslator({ locale, messages, namespace }),
  };
}
