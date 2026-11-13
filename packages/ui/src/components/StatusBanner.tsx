import { Inbox, TriangleAlert, Upload, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Alert } from '../primitives/alert';

export type StatusBannerProps = {
  /**
   * The page-wide condition. `offline` and `limit` need the user's attention soon (warning);
   * `import` and `inbox` are work the user started or can start (accent).
   */
  condition: 'offline' | 'import' | 'limit' | 'inbox';
  children: ReactNode;
  /** One button: "Resume", "Process now". */
  action?: ReactNode;
  className?: string;
};

const look = {
  offline: { tone: 'warning', Icon: WifiOff },
  limit: { tone: 'warning', Icon: TriangleAlert },
  import: { tone: 'info', Icon: Upload },
  inbox: { tone: 'info', Icon: Inbox },
} as const;

/** A page-wide condition to know about while working: offline, import running, limit, inbox. */
export function StatusBanner({ condition, children, action, className }: StatusBannerProps) {
  const { tone, Icon } = look[condition];
  return (
    <Alert
      data-component="StatusBanner"
      data-condition={condition}
      tone={tone}
      role="status"
      className={cn('items-center py-2.5 [&>svg]:mt-0', className)}
    >
      <Icon aria-hidden />
      <span className="flex-1">{children}</span>
      {action}
    </Alert>
  );
}
