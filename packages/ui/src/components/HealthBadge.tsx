import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react';
import { Badge } from '../primitives/badge';

export type HealthBadgeProps = {
  /** Ongoing health of a connection. */
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  /** "Healthy", "Working", "Down". */
  label: string;
  latencyMs?: number;
};

const look = {
  healthy: { variant: 'success', Icon: CircleCheck },
  degraded: { variant: 'warning', Icon: TriangleAlert },
  down: { variant: 'destructive', Icon: CircleAlert },
  unknown: { variant: 'neutral', Icon: null },
} as const;

/** The ongoing health of an instance port or provider. Not a job item's state (QueueItemStatus). */
export function HealthBadge({ status, label, latencyMs }: HealthBadgeProps) {
  const { variant, Icon } = look[status];
  return (
    <Badge data-component="HealthBadge" data-status={status} variant={variant}>
      {Icon ? <Icon aria-hidden /> : null}
      {label}
      {latencyMs !== undefined ? <span className="tabular">{` · ${latencyMs} ms`}</span> : null}
    </Badge>
  );
}
