'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { cn } from '../lib/cn';
import { Input } from '../primitives/input';
import { Label } from '../primitives/label';
import { Progress } from '../primitives/progress';

export type PassphraseFieldProps = {
  /** `create` shows the strength meter; `enter` is for unlocking. */
  mode: 'create' | 'enter';
  value: string;
  onChange: (value: string) => void;
  label: string;
  /** Create mode: 0 (weak) to 4 (strong), with its word ("Strong enough"). */
  strength?: { score: 0 | 1 | 2 | 3 | 4; label: string };
  hint?: string;
  error?: string;
  labels: { show: string; hide: string };
};

/** Create or enter the passphrase fallback. */
export function PassphraseField({
  mode,
  value,
  onChange,
  label,
  strength,
  hint,
  error,
  labels,
}: PassphraseFieldProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const describedBy = [
    hint ? `${id}-hint` : null,
    error ? `${id}-error` : null,
    strength ? `${id}-strength` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div data-component="PassphraseField" data-mode={mode} className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={shown ? 'text' : 'password'}
          dir="auto"
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className="pe-10"
        />
        <button
          type="button"
          aria-label={shown ? labels.hide : labels.show}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
          className="absolute end-1 top-1/2 inline-flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
        >
          {shown ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </button>
      </div>
      {mode === 'create' && strength ? (
        <div className="flex items-center gap-3">
          <Progress
            value={strength.score}
            max={4}
            aria-hidden
            tone={
              strength.score <= 1 ? 'destructive' : strength.score === 2 ? 'warning' : 'success'
            }
            className="flex-1"
          />
          <span
            id={`${id}-strength`}
            className={cn(
              'text-sm',
              strength.score <= 1 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {strength.label}
          </span>
        </div>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
