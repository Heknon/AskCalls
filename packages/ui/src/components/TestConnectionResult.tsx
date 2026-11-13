import { CircleAlert, CircleCheck } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';

export type TestConnectionResultProps = {
  state: 'idle' | 'testing' | 'ok' | 'failed';
  /** "Connected. A 3-second sample transcribed in 1.2 s." / "Upload blocked by CORS (403)." */
  detail?: string;
  onTest: () => void;
  labels: { test: string; testing: string };
};

/** A one-off check the user ran, and its outcome. */
export function TestConnectionResult({ state, detail, onTest, labels }: TestConnectionResultProps) {
  return (
    <div
      data-component="TestConnectionResult"
      data-state={state}
      className="flex flex-wrap items-center gap-3"
    >
      <Button variant="outline" size="sm" loading={state === 'testing'} onClick={onTest}>
        {state === 'testing' ? labels.testing : labels.test}
      </Button>
      {(state === 'ok' || state === 'failed') && detail ? (
        <span
          role="status"
          className={cn(
            'inline-flex items-center gap-1.5 text-sm',
            state === 'ok' ? 'text-success' : 'text-destructive',
          )}
        >
          {state === 'ok' ? (
            <CircleCheck className="size-4 shrink-0" aria-hidden />
          ) : (
            <CircleAlert className="size-4 shrink-0" aria-hidden />
          )}
          {detail}
        </span>
      ) : null}
    </div>
  );
}
