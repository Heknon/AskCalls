import type { ReactNode } from 'react';

export type UseCaseCardProps = {
  title: string;
  body: string;
  /** A sample search as read-only filter sentence fragments (`FilterBlank readOnly`). */
  sample: ReactNode;
};

/** One use case with a sample search that reads like the app's filter sentence. */
export function UseCaseCard({ title, body, sample }: UseCaseCardProps) {
  return (
    <article
      data-component="UseCaseCard"
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-6"
    >
      <h3 className="font-semibold text-lg">{title}</h3>
      <p className="text-muted-foreground leading-6">{body}</p>
      <p className="mt-auto rounded-md border border-input px-3 py-2.5 text-muted-foreground text-sm leading-7">
        {sample}
      </p>
    </article>
  );
}
