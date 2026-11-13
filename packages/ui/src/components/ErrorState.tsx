import { CircleAlert, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Alert } from '../primitives/alert';
import { Button } from '../primitives/button';

export type ErrorStateProps = {
  /** `inline`: a field or row. `panel`: a section failed. `page`: the route failed. */
  scope: 'inline' | 'panel' | 'page';
  /** What happened: "Couldn't load calls". Inline errors use only this line. */
  title: string;
  /** What to do: "The server didn't respond. Try again." Never content. */
  description?: string;
  /** A reference for support (call id prefix, error code), shown as an LTR island. */
  code?: string;
  retry?: { label: string; onRetry: () => void };
  /** Page scope: more ways out ("Go to calls"). */
  actions?: ReactNode;
  className?: string;
};

/** A failure and how to recover from it, without any content. */
export function ErrorState({
  scope,
  title,
  description,
  code,
  retry,
  actions,
  className,
}: ErrorStateProps) {
  const retryButton = retry ? (
    <Button variant="outline" size="sm" onClick={retry.onRetry}>
      <RotateCcw className="size-3.5" aria-hidden />
      {retry.label}
    </Button>
  ) : null;
  const codeText = code ? (
    <>
      {' '}
      <bdi className="ltr-island font-mono">{code}</bdi>
    </>
  ) : null;

  if (scope === 'inline') {
    return (
      <p
        data-component="ErrorState"
        data-scope="inline"
        role="alert"
        className={cn('flex items-center gap-1.5 text-destructive text-sm', className)}
      >
        <CircleAlert className="size-3.5 shrink-0" aria-hidden />
        <span>
          {title}
          {codeText}
        </span>
      </p>
    );
  }
  if (scope === 'page') {
    return (
      <div
        data-component="ErrorState"
        data-scope="page"
        role="alert"
        className={cn(
          'mx-auto flex max-w-108 flex-col items-center gap-3 py-16 text-center',
          className,
        )}
      >
        <span className="inline-flex size-12 items-center justify-center rounded-full bg-destructive-subtle text-destructive-subtle-foreground">
          <CircleAlert className="size-6" aria-hidden />
        </span>
        <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted-foreground">
            {description}
            {codeText}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {retryButton}
          {actions}
        </div>
      </div>
    );
  }
  return (
    <Alert
      data-component="ErrorState"
      data-scope="panel"
      tone="destructive"
      role="alert"
      className={className}
    >
      <CircleAlert aria-hidden />
      <div className="flex flex-col gap-1">
        <strong className="font-semibold">{title}</strong>
        {description ? (
          <span>
            {description}
            {codeText}
          </span>
        ) : null}
        {retryButton ? <div className="mt-1">{retryButton}</div> : null}
      </div>
    </Alert>
  );
}
