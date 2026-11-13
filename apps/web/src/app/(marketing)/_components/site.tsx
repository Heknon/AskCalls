import { MarketingFooter } from '@askcalls/ui/components/MarketingFooter';
import { MarketingHeader } from '@askcalls/ui/components/MarketingHeader';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { requestLocale } from '../../../server/i18n/locale';
import { GITHUB_URL, type MarketingPath } from '../_data/routes';

export function Arrow() {
  return (
    <svg
      className="arr"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ArrowLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="link" href={href}>
      {children} <Arrow />
    </a>
  );
}

/**
 * A plain form, so switching language is a full page load with no script: the route handler
 * saves the choice and redirects back here, and `<html lang dir>` comes from the new request.
 */
async function LanguageSwitch({ path }: { path: MarketingPath }) {
  const [t, locale] = await Promise.all([getTranslations('marketing.nav'), requestLocale()]);
  const other = locale === 'he' ? 'en' : 'he';
  return (
    <form method="post" action="/language" className="lang-form">
      <input type="hidden" name="locale" value={other} />
      <input type="hidden" name="next" value={path} />
      <button type="submit" lang={other} title={t('otherLanguageLabel')}>
        {t('otherLanguage')}
      </button>
    </form>
  );
}

export async function SiteHeader({ path }: { path: MarketingPath }) {
  const t = await getTranslations('marketing.nav');
  const links = [
    { href: '/security', label: t('security') },
    { href: '/pricing', label: t('pricing') },
    { href: '/self-host', label: t('selfHost') },
    { href: '/faq', label: t('faq') },
    { href: GITHUB_URL, label: t('github') },
  ].map((l) => ({ ...l, current: l.href === path }));
  return (
    <>
      <a className="skip" href="#main">
        {t('skip')}
      </a>
      <MarketingHeader
        homeHref="/"
        links={links}
        language={<LanguageSwitch path={path} />}
        signIn={{ href: '/login', label: t('signIn') }}
        start={{ href: '/login', label: t('start') }}
        labels={{
          brand: t('brand'),
          home: t('home'),
          nav: t('site'),
          menu: t('menu'),
          close: t('close'),
        }}
      />
    </>
  );
}

/** The closing chapter and the footer, on the dark ground. */
export async function SiteEnd({ sub = false }: { sub?: boolean }) {
  const [t, n, f] = await Promise.all([
    getTranslations('marketing.common'),
    getTranslations('marketing.nav'),
    getTranslations('marketing.footer'),
  ]);
  return (
    <div className="ink">
      <section className="closer" aria-labelledby="close-t">
        <div className="wrap">
          <h2 className="h1" id="close-t">
            {t('closerTitle')}
          </h2>
          {sub ? <p className="sub">{t('closerSub')}</p> : null}
          <div className="ctas">
            <a className="btn btn-primary" href="/login">
              {t('start')}
            </a>
            <ArrowLink href={GITHUB_URL}>{t('source')}</ArrowLink>
          </div>
        </div>
      </section>
      <MarketingFooter
        brand={n('brand')}
        fine={[f('fine'), f('copyright')]}
        columns={[
          {
            title: f('product'),
            links: [
              { href: '/pricing', label: n('pricing') },
              { href: '/mcp', label: n('mcp') },
              { href: '/self-host', label: n('selfHost') },
              { href: GITHUB_URL, label: n('github') },
            ],
          },
          {
            title: f('trust'),
            links: [
              { href: '/security', label: n('security') },
              { href: '/subprocessors', label: f('subprocessors') },
              { href: '/faq', label: n('faq') },
            ],
          },
          {
            title: f('legal'),
            links: [
              { href: '/privacy', label: f('privacy') },
              { href: '/terms', label: f('terms') },
              { href: '/dpa', label: f('dpa') },
            ],
          },
        ]}
      />
    </div>
  );
}

/** A terminal block. Commands are code: always LTR. */
export function Term({ bar, children }: { bar: string; children: ReactNode }) {
  return (
    <div className="term" dir="ltr">
      <div className="bar">{bar}</div>
      <pre>{children}</pre>
    </div>
  );
}

/** One command line in a `Term`. */
export function Cmd({ children }: { children: string }) {
  return (
    <>
      <span className="p">$</span> <span className="c">{children}</span>
      {'\n'}
    </>
  );
}

/** The reading layout: a sticky table of contents beside a 760 px column. */
export async function Doc({
  toc,
  children,
  className,
}: {
  toc: { id: string; label: string }[];
  children: ReactNode;
  className?: string;
}) {
  const t = await getTranslations('marketing.common');
  return (
    <main id="main" className={`wrap doc ${className ?? ''}`}>
      <nav className="toc" aria-label={t('onThisPage')}>
        <p className="lbl">{t('onThisPage')}</p>
        <ol>
          {toc.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.label}</a>
            </li>
          ))}
        </ol>
      </nav>
      <div>{children}</div>
    </main>
  );
}

/** The dark title band of a reading page. */
export function PageHero({
  path,
  title,
  lead,
  children,
}: {
  path: MarketingPath;
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="ink">
      <SiteHeader path={path} />
      <section className="shero short" aria-labelledby="t">
        <div className="wrap">
          <h1 className="h1" id="t">
            {title}
          </h1>
          {lead ? <p className="lead">{lead}</p> : null}
          {children}
        </div>
      </section>
    </div>
  );
}

export const code = (c: ReactNode) => <code>{c}</code>;
export const bold = (c: ReactNode) => <b>{c}</b>;
