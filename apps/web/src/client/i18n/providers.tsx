'use client';

import { DirectionProvider } from '@askcalls/ui/primitives/direction';
import { TooltipProvider } from '@askcalls/ui/primitives/tooltip';
import { useLocale } from 'next-intl';
import type { ReactNode } from 'react';
import { localeDir } from '../../i18n/locales';

/** Direction for Radix (menus, popovers, sliders) and one tooltip delay for the whole app. */
export function AppProviders({ children }: { children: ReactNode }) {
  const locale = useLocale();
  return (
    <DirectionProvider dir={localeDir(locale)}>
      <TooltipProvider>{children}</TooltipProvider>
    </DirectionProvider>
  );
}
