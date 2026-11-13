import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getContainer } from '../../../server/container';
import { requestLocale } from '../../../server/i18n/locale';
import type { MarketingPath } from '../_data/routes';

type PageKey =
  | 'home'
  | 'pricing'
  | 'security'
  | 'faq'
  | 'mcp'
  | 'selfHost'
  | 'privacy'
  | 'terms'
  | 'dpa'
  | 'subprocessors';

/**
 * Title, description, canonical URL and Open Graph for one marketing page. The URL is the same
 * in every language (the locale comes from the cookie or Accept-Language), so there is no
 * hreflang: one canonical URL per page, English for clients that state no preference.
 */
export async function pageMetadata(key: PageKey, path: MarketingPath): Promise<Metadata> {
  const [t, locale, { config }] = await Promise.all([
    getTranslations('marketing.meta'),
    requestLocale(),
    getContainer(),
  ]);
  const title = t(`${key}.title`);
  const description = t(`${key}.description`);
  return {
    metadataBase: new URL(config.config.appUrl),
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: t('siteName'),
      type: 'website',
      locale: locale === 'he' ? 'he_IL' : 'en_GB',
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/** `export const generateMetadata = meta('pricing', '/pricing')`. */
export const meta = (key: PageKey, path: MarketingPath) => () => pageMetadata(key, path);
