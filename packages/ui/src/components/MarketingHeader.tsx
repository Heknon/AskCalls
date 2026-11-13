import type { ElementType, ReactNode } from 'react';
import { Logo } from './Logo';

export type MarketingHeaderProps = {
  homeHref: string;
  links: { href: string; label: string; current?: boolean }[];
  /** The language control: a link or a one-button form naming the other language. */
  language: ReactNode;
  signIn: { href: string; label: string };
  start: { href: string; label: string };
  labels: { brand: string; home: string; nav: string; menu: string; close: string };
  linkAs?: ElementType;
};

const MENU_ID = 'site-menu';

/**
 * Site navigation over the dark hero: wordmark, quiet links, language, Sign in and an outlined
 * Start free. Below 1100 px the links move into a menu that uses the HTML popover attribute, so
 * the header ships no JavaScript.
 */
export function MarketingHeader({
  homeHref,
  links,
  language,
  signIn,
  start,
  labels,
  linkAs: Link = 'a',
}: MarketingHeaderProps) {
  return (
    <header data-component="MarketingHeader" className="hdr">
      <div className="wrap">
        <Link href={homeHref} aria-label={labels.home} className="brand">
          <Logo name={labels.brand} variant="bare" size="sm" className="text-[18px]" />
        </Link>
        <nav aria-label={labels.nav} className="nav">
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={l.current ? 'page' : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="grow" />
        {language}
        <Link href={signIn.href} className="quiet">
          {signIn.label}
        </Link>
        <Link href={start.href} className="btn btn-sm btn-line">
          {start.label}
        </Link>
        <button type="button" className="menu-btn" aria-label={labels.menu} popoverTarget={MENU_ID}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 8h16M4 16h16" />
          </svg>
        </button>
      </div>
      <div id={MENU_ID} popover="auto" className="menu ink" role="dialog" aria-label={labels.menu}>
        <div className="menu-top">
          <Logo name={labels.brand} variant="bare" size="sm" className="text-[18px]" />
          <button
            type="button"
            className="menu-btn"
            aria-label={labels.close}
            popoverTarget={MENU_ID}
            popoverTargetAction="hide"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <nav aria-label={labels.nav}>
          <ul>
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} aria-current={l.current ? 'page' : undefined}>
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="menu-foot">
          <Link href={signIn.href}>{signIn.label}</Link>
          {language}
        </div>
      </div>
    </header>
  );
}
