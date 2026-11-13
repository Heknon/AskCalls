import type { LucideIcon } from 'lucide-react';
import type { ElementType, ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Avatar } from '../primitives/avatar';
import { Logo } from './Logo';

export type GateLayoutProps = {
  /** "AskCalls": the logo's name, and the home link's accessible name. */
  brand: string;
  homeHref: string;
  /** The top end of the page: the language switcher, or "Step 3 of 5". */
  end?: ReactNode;
  /** Full-width content above the column, such as the onboarding `Stepper`. */
  top?: ReactNode;
  /** `narrow` (432 px): sign-in and unlock. `wide` (560 px): onboarding steps. */
  width?: 'narrow' | 'wide';
  children: ReactNode;
  linkAs?: ElementType;
};

/**
 * The frame of a focused flow without app navigation: sign in, the unlock gate, onboarding.
 * Logo at the top start, one control at the top end, one centred column.
 */
export function GateLayout({
  brand,
  homeHref,
  end,
  top,
  width = 'narrow',
  children,
  linkAs: Link = 'a',
}: GateLayoutProps) {
  return (
    <div
      data-component="GateLayout"
      className="flex min-h-dvh flex-col items-center px-4 pt-6 pb-12"
    >
      <header className="mb-6 flex w-full max-w-240 items-center justify-between gap-4 md:mb-12">
        <Link href={homeHref} aria-label={brand} className="no-underline">
          <Logo name={brand} />
        </Link>
        {end ? <div className="text-muted-foreground text-sm">{end}</div> : null}
      </header>
      {top ? <div className="mb-10 w-full max-w-240">{top}</div> : null}
      <main
        id="main"
        className={cn(
          'flex w-full flex-col gap-6',
          width === 'narrow' ? 'max-w-108' : 'max-w-140',
        )}
      >
        {children}
      </main>
    </div>
  );
}

export type GateHeadingProps = {
  /** The gate's own icon in a tinted tile (the lock on the unlock gate). */
  icon?: LucideIcon;
  /** The page's `h1`. */
  title: string;
  /** One line under the title. */
  description?: ReactNode;
};

/** The title of a gate or onboarding step: gate title role, one line under it. */
export function GateHeading({ icon: Icon, title, description }: GateHeadingProps) {
  return (
    <div data-component="GateHeading" className="flex flex-col gap-6">
      {Icon ? (
        <span className="inline-flex size-12 items-center justify-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
          <Icon className="size-6" aria-hidden />
        </span>
      ) : null}
      <div>
        <h1 tabIndex={-1} className="font-semibold text-3xl tracking-tight outline-none">
          {title}
        </h1>
        {description ? (
          <div className="mt-2 flex flex-col gap-2 text-md text-muted-foreground leading-6.5">
            {description}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** "or" between two groups of sign-in methods. */
export function GateDivider({ label }: { label: string }) {
  return (
    <div
      data-component="GateDivider"
      className="flex items-center gap-3 text-muted-foreground text-sm before:h-px before:flex-1 before:bg-border before:content-[''] after:h-px after:flex-1 after:bg-border after:content-['']"
    >
      {label}
    </div>
  );
}

/** Who is signed in, with one action (Sign out). The email is a bidi island inside `children`. */
export function GateAccount({
  initials,
  children,
  action,
}: {
  initials: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      data-component="GateAccount"
      className="flex items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2.5 text-sm"
    >
      <Avatar initials={initials} />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {action}
    </div>
  );
}

/** The footnote of a gate: legal line, what happens without a recovery code. */
export function GateNote({ children }: { children: ReactNode }) {
  return (
    <p
      data-component="GateNote"
      className="text-muted-foreground text-sm leading-5 [&_a]:text-primary"
    >
      {children}
    </p>
  );
}
