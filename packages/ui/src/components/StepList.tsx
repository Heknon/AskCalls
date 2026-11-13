import type { ReactNode } from 'react';

export type StepListProps = {
  steps: { key: string; title: string; body: ReactNode }[];
};

/** A numbered sequence of how something works. */
export function StepList({ steps }: StepListProps) {
  return (
    <ol data-component="StepList" className="m-0 grid list-none gap-6 p-0 md:grid-cols-3">
      {steps.map((s, i) => (
        <li
          key={s.key}
          className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-border bg-card p-6"
        >
          <span
            aria-hidden
            className="inline-flex size-8 items-center justify-center rounded-full bg-primary-subtle font-semibold text-primary-subtle-foreground"
          >
            {i + 1}
          </span>
          <h3 className="font-semibold text-lg">{s.title}</h3>
          <div className="text-muted-foreground leading-6">{s.body}</div>
        </li>
      ))}
    </ol>
  );
}
