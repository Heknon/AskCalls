import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppProviders } from '../client/i18n/providers';
import { THEME_SCRIPT } from '../client/theme/script';
import { localeDir } from '../i18n/locales';
import { MARKETING_HEADER } from '../server/http/csp';
import { requestLocale } from '../server/i18n/locale';
import './globals.css';

export const metadata: Metadata = {
  title: 'AskCalls',
  description: "Ask your calls anything. End-to-end encrypted. We can't read your calls.",
  icons: { icon: '/icons/icon.svg', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F8F8' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1213' },
  ],
};

/**
 * `<html lang dir>` comes from the resolved locale (account, cookie, Accept-Language). The theme
 * script follows the system colour scheme before first paint; it carries the request's CSP
 * nonce where middleware set one.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, messages, h] = await Promise.all([requestLocale(), getMessages(), headers()]);
  const nonce = h.get('x-nonce') ?? undefined;
  // Marketing pages (set by middleware) use no client providers: their markup is server-rendered
  // with the messages they need, so the message catalog stays out of the page.
  const marketing = h.get(MARKETING_HEADER) === '1';
  return (
    <html lang={locale} dir={localeDir(locale)} suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          suppressHydrationWarning
          // biome-ignore lint/security/noDangerouslySetInnerHtml: a fixed string, no user data
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>
      <body>
        {marketing ? (
          children
        ) : (
          <NextIntlClientProvider locale={locale} messages={messages}>
            <AppProviders>{children}</AppProviders>
          </NextIntlClientProvider>
        )}
      </body>
    </html>
  );
}
