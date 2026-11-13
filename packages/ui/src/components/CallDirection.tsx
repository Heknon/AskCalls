import { Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { cn } from '../lib/cn';

export type CallDirectionValue = 'incoming' | 'outgoing' | 'unknown';

export type CallDirectionProps = {
  direction: CallDirectionValue;
  /** "Incoming". Shown when `withLabel`, otherwise the icon's accessible name. */
  label: string;
  withLabel?: boolean;
  className?: string;
};

const icons = { incoming: PhoneIncoming, outgoing: PhoneOutgoing, unknown: Phone };

/** Whether a call was incoming, outgoing or unknown. Handset icons never mirror. */
export function CallDirection({
  direction,
  label,
  withLabel = false,
  className,
}: CallDirectionProps) {
  const Icon = icons[direction];
  return (
    <span
      data-component="CallDirection"
      data-direction={direction}
      className={cn('inline-flex items-center gap-1 text-muted-foreground', className)}
    >
      <Icon
        className="size-3.5 shrink-0"
        aria-hidden={withLabel ? true : undefined}
        aria-label={withLabel ? undefined : label}
        role={withLabel ? undefined : 'img'}
      />
      {withLabel ? <span>{label}</span> : null}
    </span>
  );
}
