'use client';

import { Menu } from 'lucide-react';
import type { ElementType, ReactNode } from 'react';
import { Button } from '../primitives/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../primitives/sheet';
import { Logo } from './Logo';

export type MarketingHeaderProps = {
  homeHref: string;
  links: { href: string; label: string }[];
  /** The language switcher (a `Select`). */
  language: ReactNode;
  signIn: { href: string; label: string };
  start: { href: string; label: string };
  labels: { brand: string; nav: string; menu: string };
  linkAs?: ElementType;
};

/** Site navigation: logo, links, language, Sign in and Start free. A menu sheet below 768 px. */
export function MarketingHeader({
  homeHref,
  links,
  language,
  signIn,
  start,
  labels,
  linkAs: Link = 'a',
}: MarketingHeaderProps) {
  const nav = (
    <nav aria-label={labels.nav} className="flex gap-5 max-md:flex-col max-md:gap-4">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="text-muted-foreground no-underline hover:text-foreground"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
  return (
    <header
      data-component="MarketingHeader"
      className="sticky top-0 z-20 border-border border-b bg-background/88 backdrop-blur-md"
    >
      <div className="mx-auto flex h-16 max-w-280 items-center gap-6 px-4 md:px-6">
        <Link href={homeHref} aria-label={labels.brand} className="no-underline">
          <Logo name={labels.brand} />
        </Link>
        <div className="max-md:hidden">{nav}</div>
        <div className="ms-auto flex items-center gap-2">
          <div className="max-md:hidden">{language}</div>
          <Button variant="ghost" asChild className="max-md:hidden">
            <Link href={signIn.href}>{signIn.label}</Link>
          </Button>
          <Button variant="primary" asChild>
            <Link href={start.href}>{start.label}</Link>
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={labels.menu} className="md:hidden">
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="end" className="gap-6 p-6">
              <SheetTitle className="font-semibold">{labels.brand}</SheetTitle>
              {nav}
              {language}
              <Link href={signIn.href}>{signIn.label}</Link>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
