import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Card } from '../primitives/card';

export type SettingsSectionProps = {
  title: string;
  /** Only when it changes what the user does here. */
  description?: string;
  /** One or two buttons at the end of the header ("Add passkey"). */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** A titled block of related settings. */
export function SettingsSection({
  title,
  description,
  actions,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <Card data-component="SettingsSection" className={className}>
      <div className="flex items-start gap-3 border-border border-b px-5 py-4.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="font-semibold text-md">{title}</h2>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      <div className={cn('px-5 py-2')}>{children}</div>
    </Card>
  );
}
