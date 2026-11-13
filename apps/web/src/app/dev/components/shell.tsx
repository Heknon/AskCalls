'use client';

import { NoticeRegion } from '@askcalls/ui/components/Notice';
import { DirectionProvider } from '@askcalls/ui/primitives/direction';
import { TooltipProvider } from '@askcalls/ui/primitives/tooltip';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { GROUPS } from './groups';

export type Lang = 'en' | 'he';
type GalleryEnv = { lang: Lang; dark: boolean; locale: string; now: Date };

/** The gallery's fixed "now", so relative dates and screenshots stay stable. */
export const NOW = new Date('2026-11-13T15:00:00');

const Env = createContext<GalleryEnv>({ lang: 'en', dark: false, locale: 'en-GB', now: NOW });
export const useEnv = () => useContext(Env);

/** Picks the copy for the gallery's language. */
export function useCopy<T>(copy: { en: T; he: T }): T {
  return copy[useEnv().lang];
}

function Toggle({
  options,
  value,
  onChange,
  label,
}: {
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <fieldset className="flex rounded-full border border-border bg-card p-0.5" aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={v === value}
          onClick={() => onChange(v)}
          className="cursor-pointer rounded-full px-2.5 py-1 font-semibold text-muted-foreground text-xs aria-pressed:bg-primary-subtle aria-pressed:text-primary-subtle-foreground"
        >
          {text}
        </button>
      ))}
    </fieldset>
  );
}

export function GalleryShell({ current, children }: { current: string; children: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const lang: Lang = params.get('lang') === 'he' ? 'he' : 'en';
  const dark = params.get('theme') === 'dark';
  const query = params.toString();

  useEffect(() => {
    const html = document.documentElement;
    html.lang = lang;
    html.dir = lang === 'he' ? 'rtl' : 'ltr';
    html.classList.toggle('dark', dark);
  }, [lang, dark]);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  return (
    <Env.Provider value={{ lang, dark, locale: lang === 'he' ? 'he-IL' : 'en-GB', now: NOW }}>
      <DirectionProvider dir={lang === 'he' ? 'rtl' : 'ltr'}>
        <TooltipProvider>
          <NoticeRegion label={lang === 'he' ? 'התראות' : 'Notifications'}>
            <header className="sticky top-0 z-30 border-border border-b bg-card/95 backdrop-blur-sm">
              <div className="mx-auto flex max-w-300 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-6">
                <h1 className="font-semibold text-md">UI kit</h1>
                <nav aria-label="Component groups" className="flex flex-wrap gap-1 text-sm">
                  {GROUPS.map((g) => (
                    <Link
                      key={g.key}
                      href={`/dev/components/${g.key}${query ? `?${query}` : ''}`}
                      aria-current={g.key === current ? 'page' : undefined}
                      className="rounded-md px-2 py-1 text-muted-foreground no-underline hover:bg-accent aria-[current=page]:bg-primary-subtle aria-[current=page]:text-primary-subtle-foreground"
                    >
                      {g.title}
                    </Link>
                  ))}
                </nav>
                <div className="ms-auto flex gap-2" dir="ltr">
                  <Toggle
                    label="Theme"
                    options={[
                      ['light', 'Light'],
                      ['dark', 'Dark'],
                    ]}
                    value={dark ? 'dark' : 'light'}
                    onChange={(v) => set('theme', v)}
                  />
                  <Toggle
                    label="Language"
                    options={[
                      ['en', 'EN'],
                      ['he', 'עב'],
                    ]}
                    value={lang}
                    onChange={(v) => set('lang', v)}
                  />
                </div>
              </div>
            </header>
            {children}
          </NoticeRegion>
        </TooltipProvider>
      </DirectionProvider>
    </Env.Provider>
  );
}

/** One component on a gallery page, with its catalog name and the states shown. */
export function Specimen({
  name,
  note,
  wide = false,
  children,
}: {
  name: string;
  note?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={name}
      data-specimen={name}
      className={wide ? 'flex min-w-0 flex-col gap-3 lg:col-span-2' : 'flex min-w-0 flex-col gap-3'}
    >
      <header className="flex items-baseline gap-2" dir="ltr">
        <h2 className="font-mono font-semibold text-sm">{name}</h2>
        {note ? <span className="text-muted-foreground text-xs">{note}</span> : null}
      </header>
      {children}
    </section>
  );
}

/** A labelled variant or state inside a specimen. */
export function State({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="flex items-center gap-1.5 text-muted-foreground text-xs" dir="ltr">
        <span className="size-1.5 rounded-full bg-warning" aria-hidden />
        {label}
      </span>
      {children}
    </div>
  );
}
