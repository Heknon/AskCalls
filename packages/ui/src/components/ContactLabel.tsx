import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { DecryptingPlaceholder } from './DecryptingPlaceholder';
import { PhoneNumber } from './PhoneNumber';

export type ContactLabelProps = {
  name?: string;
  /** E.164. */
  phone?: string;
  /** `auto`: the name when known, else the number. */
  show?: 'name+number' | 'name' | 'auto';
  /** The number was withheld; `hiddenLabel` is shown instead ("Hidden number"). */
  hidden?: boolean;
  hiddenLabel?: string;
  /** Metadata not decrypted yet. */
  locked?: boolean;
  /** `header`: the open call's title in the call view. */
  context?: 'row' | 'header';
  className?: string;
};

/** How a call's other party is shown: the name, or the number, or "Hidden number". */
export function ContactLabel({
  name,
  phone,
  show = 'name+number',
  hidden = false,
  hiddenLabel,
  locked = false,
  context = 'row',
  className,
}: ContactLabelProps) {
  const header = context === 'header';
  if (locked) {
    return (
      <span data-component="ContactLabel" className={cn('inline-flex gap-2.5', className)}>
        <DecryptingPlaceholder className="w-30" />
        {show === 'name+number' ? <DecryptingPlaceholder className="w-28" /> : null}
      </span>
    );
  }
  const nameClass = cn('font-semibold', header && 'text-2xl tracking-tight max-md:text-xl');
  const numberClass = cn('text-muted-foreground', header ? 'text-md' : 'text-sm');
  let primary: ReactNode;
  let secondary: ReactNode = null;
  if (hidden || (!name && !phone)) {
    primary = <span className={nameClass}>{hiddenLabel}</span>;
  } else if (name) {
    primary = (
      <span dir="auto" className={nameClass}>
        {name}
      </span>
    );
    if (show === 'name+number' && phone) {
      secondary = <PhoneNumber e164={phone} className={numberClass} />;
    }
  } else if (phone) {
    primary = <PhoneNumber e164={phone} className={nameClass} />;
  }
  return (
    <span
      data-component="ContactLabel"
      className={cn('inline-flex min-w-0 flex-wrap items-baseline gap-x-2', className)}
    >
      {primary}
      {secondary ? <span data-part="number">{secondary}</span> : null}
    </span>
  );
}
