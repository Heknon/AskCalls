import { type LucideIcon, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type EmptyStateProps = {
  /** Why the view is empty; sets the default icon. */
  reason: 'first-use' | 'no-results' | 'filtered' | 'feature-off';
  /** One short line: "No calls yet". */
  title: string;
  /** Only what the user acts on: "Also tried: מחירים, price". */
  detail?: ReactNode;
  /** The next step: one or two buttons. */
  action?: ReactNode;
  /**
   * The subject's icon for `first-use` and `feature-off` (phone for calls, tag for tags, the
   * feature's own icon). Searches default to `search`.
   */
  icon?: LucideIcon;
  className?: string;
};

/** Why a view is empty and the next step: an icon circle, one line, one action. */
export function EmptyState({ reason, title, detail, action, icon, className }: EmptyStateProps) {
  const Icon = icon ?? Search;
  return (
    <div
      data-component="EmptyState"
      data-reason={reason}
      className={cn('flex flex-col items-center gap-2.5 px-4 py-10 text-center', className)}
    >
      <span className="mb-1 inline-flex size-12 items-center justify-center rounded-full bg-primary-subtle text-primary-subtle-foreground">
        <Icon className="size-6" aria-hidden />
      </span>
      <h3 className="font-semibold text-md">{title}</h3>
      {detail ? <p className="max-w-104 text-muted-foreground">{detail}</p> : null}
      {action ? <div className="flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
