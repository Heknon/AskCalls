import { Server } from 'lucide-react';
import { useId } from 'react';

export type EnvLockedFieldProps = {
  label: string;
  value: string;
  /** "Set by the server environment". */
  caption: string;
  /** The value is a URL, host or key name: an LTR island in mono. */
  technical?: boolean;
};

/** A setting fixed by a server environment variable. The server icon, never the lock. */
export function EnvLockedField({ label, value, caption, technical = true }: EnvLockedFieldProps) {
  const id = useId();
  return (
    <div data-component="EnvLockedField" className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-medium text-sm">
        {label}
      </label>
      <input
        id={id}
        readOnly
        value={value}
        dir={technical ? 'ltr' : 'auto'}
        aria-describedby={`${id}-c`}
        className={
          technical
            ? 'ltr-island h-9 w-full rounded-md border border-input bg-muted px-3 font-mono text-muted-foreground text-sm'
            : 'h-9 w-full rounded-md border border-input bg-muted px-3 text-muted-foreground'
        }
      />
      <span id={`${id}-c`} className="flex items-center gap-1.5 text-muted-foreground text-sm">
        <Server className="size-3.5" aria-hidden />
        {caption}
      </span>
    </div>
  );
}
