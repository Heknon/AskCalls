import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type PageHeaderProps = {
  /** The page's `h1`. */
  title: string;
  /** Only when it carries information the user acts on; most pages have none. */
  description?: string;
  actions?: ReactNode;
  className?: string;
};

/** The title and page actions of a page. */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      data-component="PageHeader"
      className={cn('mb-5 flex flex-wrap items-end justify-between gap-4', className)}
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-semibold text-xl tracking-tight md:text-2xl">{title}</h1>
        {description ? <p className="text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
