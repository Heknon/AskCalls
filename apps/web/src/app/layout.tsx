import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { AppProviders } from '../client/i18n/providers';
import { THEME_SCRIPT } from '../client/theme/script';
import { localeDir } from '../i18n/locales';
import { requestLocale } from '../server/i18n/locale';
import './globals.css';

export const metadata: Metadata = {
  title: 'AskCalls',
  description: "Ask your calls anything. End-to-end encrypted. We can't read your calls.",
};

/**
 * `<html lang dir>` comes from the resolved locale (account, cookie, Accept-Language). The theme
 * script follows the system colour scheme before first paint; it carries the request's CSP
 * nonce where middleware set one.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const [locale, messages, nonce] = await Promise.all([
    requestLocale(),
    getMessages(),
    headers().then((h) => h.get('x-nonce') ?? undefined),
  ]);
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
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
