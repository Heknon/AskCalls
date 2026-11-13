import { ArrowRight, Cloud, Laptop, Server } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export type DataFlowRoute = 'on-device' | 'direct' | 'managed' | 'passthrough' | 'inbox' | 'off';

export type DataFlowNoteProps = {
  /**
   * Where plaintext goes. `on-device`: nothing leaves. `direct`: device straight to the provider
   * under your account. `managed`: through AskCalls, streamed, not stored. `passthrough`: through
   * AskCalls with your key. `inbox`: visible to the server in transit, then encrypted. `off`.
   */
  route: DataFlowRoute;
  /** The sentence from the `dataFlow.*` messages; it carries the meaning. */
  children: ReactNode;
  /** Node names for the diagram. `source` is who sends inbox items (the agent, a client). */
  nodes: { device: string; server: string; provider?: string; source?: string };
  /** `compact`: the one-line version under the ask input. */
  size?: 'full' | 'compact';
  className?: string;
};

function Node({ icon, label, external }: { icon: ReactNode; label: string; external?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.25 rounded-full border bg-card px-2 font-medium text-foreground text-xs [&_svg]:size-3.5',
        external ? 'border-input border-dashed' : 'border-border',
      )}
    >
      {icon}
      <bdi>{label}</bdi>
    </span>
  );
}

function Hop({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <ArrowRight className="icon-directional size-3.5 text-muted-foreground" />
      {children}
    </span>
  );
}

/** Where plaintext goes for one feature: a route diagram plus one sentence. */
export function DataFlowNote({
  route,
  children,
  nodes,
  size = 'full',
  className,
}: DataFlowNoteProps) {
  if (size === 'compact') {
    return (
      <p
        data-component="DataFlowNote"
        data-route={route}
        className={cn('text-muted-foreground text-xs leading-4', className)}
      >
        {children}
      </p>
    );
  }
  const device = <Node icon={<Laptop />} label={nodes.device} />;
  const server = <Node icon={<Server />} label={nodes.server} />;
  const provider = <Node icon={<Cloud />} label={nodes.provider ?? ''} external />;
  const source = <Node icon={<Cloud />} label={nodes.source ?? ''} external />;
  const paths: Record<DataFlowRoute, ReactNode[]> = {
    'on-device': [device],
    direct: [device, provider],
    managed: [device, server, provider],
    passthrough: [device, server, provider],
    inbox: [source, server, device],
    off: [],
  };
  const path = paths[route];
  return (
    <div
      data-component="DataFlowNote"
      data-route={route}
      className={cn(
        'flex flex-col gap-2 rounded-md bg-muted px-3.5 py-3 text-sm leading-5',
        className,
      )}
    >
      {path.length ? (
        <div aria-hidden className="flex flex-wrap items-center gap-1.5">
          {path.map((node, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed route, never reordered
            <Fragment key={i}>{i === 0 ? node : <Hop>{node}</Hop>}</Fragment>
          ))}
        </div>
      ) : null}
      <p>{children}</p>
    </div>
  );
}
