import { LoaderCircle } from 'lucide-react';
import { cn } from '../lib/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <LoaderCircle
      className={cn('size-3.5 animate-spin motion-reduce:animate-none', className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
