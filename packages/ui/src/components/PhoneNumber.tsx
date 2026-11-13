'use client';

import { Copy } from 'lucide-react';
import { cn } from '../lib/cn';
import { formatPhone } from '../lib/format';
import { Button } from '../primitives/button';

export type PhoneNumberProps = {
  e164: string;
  format?: 'international' | 'national';
  /** Shows a copy button; the label names it ("Copy number"). */
  copyLabel?: string;
  onCopy?: (e164: string) => void;
  className?: string;
};

/** One phone number, formatted for reading and dialling. Always an LTR island. */
export function PhoneNumber({
  e164,
  format = 'international',
  copyLabel,
  onCopy,
  className,
}: PhoneNumberProps) {
  const number = (
    <bdi data-component="PhoneNumber" className={cn('ltr-island tabular', className)}>
      {formatPhone(e164, format)}
    </bdi>
  );
  if (!copyLabel) return number;
  return (
    <span className="inline-flex items-center gap-1">
      {number}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={copyLabel}
        className="size-6 text-muted-foreground"
        onClick={() => {
          void navigator.clipboard?.writeText(e164);
          onCopy?.(e164);
        }}
      >
        <Copy className="size-3.5" aria-hidden />
      </Button>
    </span>
  );
}
