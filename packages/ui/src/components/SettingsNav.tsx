import { ChevronRight } from 'lucide-react';
import type { ElementType } from 'react';
import { cn } from '../lib/cn';

export type SettingsNavProps = {
  items: { key: string; href: string; label: string }[];
  /** The open section; none on the phone index page. */
  active?: string;
  /** "Settings sections". */
  label: string;
  /**
   * `list`: the 208 px column beside the section on desktop. `index`: the full-width list that is
   * the Settings page on tablets and phones, one row per section with a chevron.
   */
  variant?: 'list' | 'index';
  linkAs?: ElementType;
  className?: string;
};

/** The list of Settings sections. */
export function SettingsNav({
  items,
  active,
  label,
  variant = 'list',
  linkAs: Link = 'a',
  className,
}: SettingsNavProps) {
  const index = variant === 'index';
  return (
    <nav data-component="SettingsNav" data-variant={variant} aria-label={label} className={className}>
      <ul
        className={cn(
          'm-0 flex list-none flex-col p-0',
          index ? 'overflow-hidden rounded-lg border border-border bg-card' : 'gap-0.5',
        )}
      >
        {items.map((it) => {
          const current = it.key === active;
          return (
            <li key={it.key} className={cn(index && 'border-border border-b last:border-b-0')}>
              <Link
                href={it.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 text-foreground no-underline',
                  index
                    ? 'tap-target min-h-13 px-4 hover:bg-accent'
                    : 'h-9 rounded-md px-2.5 font-medium text-sm hover:bg-accent',
                  current && 'bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {index ? (
                  <ChevronRight className="icon-directional size-4 text-muted-foreground" aria-hidden />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
