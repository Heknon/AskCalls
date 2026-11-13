import { ArrowLeft } from 'lucide-react';
import type { ElementType, ReactNode } from 'react';
import { Logo } from './Logo';

export type MobileTopBarProps = {
  title: string;
  /** One icon button for the page action (Upload on Calls). */
  action?: ReactNode;
  /** Shows a back arrow instead of the logo. */
  back?: { href: string; label: string };
  /** The `LockStatus variant="icon"`. */
  lock: ReactNode;
  linkAs?: ElementType;
};

/** Page title, one action and the lock button on phones. */
export function MobileTopBar({ title, action, back, lock, linkAs: Link = 'a' }: MobileTopBarProps) {
  return (
    <header
      data-component="MobileTopBar"
      className="sticky top-0 z-10 flex h-13 items-center gap-2 border-border border-b bg-card px-3 md:hidden"
    >
      {back ? (
        <Link
          href={back.href}
          aria-label={back.label}
          className="-ms-1 inline-flex size-9 items-center justify-center rounded-md text-foreground hover:bg-accent"
        >
          <ArrowLeft className="icon-directional size-5" aria-hidden />
        </Link>
      ) : (
        <Logo size="sm" />
      )}
      <h1 className="min-w-0 flex-1 truncate font-semibold text-md">{title}</h1>
      {action}
      {lock}
    </header>
  );
}
