import { ArrowDown, ArrowRight, Database, Laptop, Server } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export type TrustDiagramColumn = {
  /** What part of the system it is; sets the icon. The device is the one that sees plaintext. */
  part: 'device' | 'server' | 'storage';
  title: string;
  /** What this part holds. */
  holds: string[];
  /** Device only: "Only your device sees plaintext". */
  note?: string;
};

export type TrustDiagramProps = {
  columns: TrustDiagramColumn[];
  /** The exceptions: `DataFlowNote`s for the paths where plaintext leaves the device. */
  exceptions?: ReactNode;
  /** `compact`: onboarding's welcome step. */
  size?: 'full' | 'compact';
  className?: string;
};

const icons = { device: Laptop, server: Server, storage: Database };

/** What each part of the system holds: the whole privacy model in one picture. */
export function TrustDiagram({ columns, exceptions, size = 'full', className }: TrustDiagramProps) {
  const compact = size === 'compact';
  return (
    <div data-component="TrustDiagram" className={cn('flex flex-col gap-8', className)}>
      <div className="grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {columns.map((c, i) => {
          const Icon = icons[c.part];
          return (
            <Fragment key={c.part}>
              {i > 0 ? (
                <div aria-hidden className="flex items-center justify-center text-muted-foreground">
                  <ArrowRight className="icon-directional size-5 max-lg:hidden" />
                  <ArrowDown className="size-5 lg:hidden" />
                </div>
              ) : null}
              <section
                className={cn(
                  'flex min-w-0 flex-col gap-3.5 rounded-xl border border-border bg-card',
                  compact ? 'p-4' : 'p-6',
                  c.part === 'device' && 'border-primary ring-1 ring-primary',
                )}
              >
                <h3 className="flex items-center gap-2 font-semibold text-md">
                  <Icon className="size-4.5" aria-hidden />
                  {c.title}
                </h3>
                <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                  {c.holds.map((h) => (
                    <li key={h} className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground"
                      />
                      {h}
                    </li>
                  ))}
                </ul>
                {c.note ? (
                  <span className="self-start rounded-full bg-primary-subtle px-2 py-0.5 font-medium text-primary-subtle-foreground text-xs">
                    {c.note}
                  </span>
                ) : null}
              </section>
            </Fragment>
          );
        })}
      </div>
      {exceptions ? <div className="grid gap-4 md:grid-cols-3">{exceptions}</div> : null}
    </div>
  );
}
