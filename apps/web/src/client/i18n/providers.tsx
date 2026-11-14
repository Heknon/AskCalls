'use client';

import { DirectionProvider } from '@askcalls/ui/primitives/direction';
import { TooltipProvider } from '@askcalls/ui/primitives/tooltip';
import { IntlProvider, useLocale } from 'next-intl';
import { type ReactNode, useSyncExternalStore } from 'react';
import { localeDir } from '../../i18n/locales';

const unchanging = () => () => {};
const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverTimeZone = () => undefined;

/**
 * Dates in the device's time zone, direction for Radix (menus, popovers, sliders) and one tooltip
 * delay. The server hands down its own zone (UTC in production); hydration keeps it, so server
 * and client markup match, then the device's takes over.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const timeZone = useSyncExternalStore(unchanging, deviceTimeZone, serverTimeZone);
  return (
    <IntlProvider locale={locale} timeZone={timeZone}>
      <DirectionProvider dir={localeDir(locale)}>
        <TooltipProvider>{children}</TooltipProvider>
      </DirectionProvider>
    </IntlProvider>
  );
}
