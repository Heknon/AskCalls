import { Check } from 'lucide-react';
import { cn } from '../lib/cn';

export type StepperProps = {
  /** `horizontal`: onboarding and device linking. `vertical`: the setup wizard. */
  orientation?: 'horizontal' | 'vertical';
  steps: { key: string; label: string }[];
  /** Index of the current step. */
  current: number;
  /** Names the list: "Setup steps". */
  label?: string;
  className?: string;
};

/** Position in a fixed sequence of steps. Mirrors in RTL. */
export function Stepper({
  orientation = 'horizontal',
  steps,
  current,
  label,
  className,
}: StepperProps) {
  const vertical = orientation === 'vertical';
  return (
    <ol
      data-component="Stepper"
      aria-label={label}
      className={cn('m-0 flex list-none gap-2 p-0', vertical && 'flex-col gap-0', className)}
    >
      {steps.map((s, i) => {
        const done = i < current;
        const cur = i === current;
        const last = i === steps.length - 1;
        return (
          <li
            key={s.key}
            aria-current={cur ? 'step' : undefined}
            className={cn(
              'relative flex min-w-0 items-center gap-2 text-muted-foreground text-sm',
              cur && 'font-medium text-foreground',
              vertical ? 'py-2' : 'flex-auto',
              !vertical && last && 'flex-none',
              !vertical &&
                !last &&
                'after:mx-1 after:h-px after:min-w-3 after:flex-1 after:bg-border after:content-[""]',
              vertical &&
                !last &&
                'before:absolute before:start-3 before:top-9 before:h-[calc(100%-2rem)] before:w-px before:bg-border before:content-[""]',
            )}
          >
            <span
              className={cn(
                'inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-input bg-card font-semibold text-xs',
                cur && 'border-primary text-primary ring-3 ring-primary-subtle',
                done && 'border-primary bg-primary text-primary-foreground',
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className={cn('truncate', !cur && 'max-md:sr-only')}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
