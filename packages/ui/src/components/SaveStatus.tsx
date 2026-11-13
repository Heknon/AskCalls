import { Check, CircleAlert } from 'lucide-react';
import { cn } from '../lib/cn';
import { Spinner } from '../primitives/spinner';

export type SaveStatusProps = {
  state: 'saving' | 'saved' | 'error';
  /** "Saving…", "Saved", "Couldn't save." and the retry verb. */
  labels: { saving: string; saved: string; error: string; retry: string };
  onRetry?: () => void;
  className?: string;
};

/** An edit was saved, is saving, or failed. Never mentions encryption. */
export function SaveStatus({ state, labels, onRetry, className }: SaveStatusProps) {
  return (
    <span
      data-component="SaveStatus"
      data-state={state}
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 text-xs',
        state === 'error' ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
    >
      {state === 'saving' ? <Spinner /> : null}
      {state === 'saved' ? <Check className="size-3.5" aria-hidden /> : null}
      {state === 'error' ? <CircleAlert className="size-3.5" aria-hidden /> : null}
      {state === 'saving' ? labels.saving : state === 'saved' ? labels.saved : labels.error}
      {state === 'error' && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="cursor-pointer font-medium underline underline-offset-2"
        >
          {labels.retry}
        </button>
      ) : null}
    </span>
  );
}
