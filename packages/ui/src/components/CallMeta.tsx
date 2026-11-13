import { cn } from '../lib/cn';
import { formatDateTime, formatDuration, formatDurationExact, formatWhen } from '../lib/format';
import { DecryptingPlaceholder } from './DecryptingPlaceholder';

export type CallMetaProps = {
  startedAt: Date;
  durationSec: number;
  /** UI locale for `Intl` ("en-GB", "he-IL"). */
  locale: string;
  layout?: 'stacked' | 'inline';
  /** `header`: the call view shows the full date and the exact length. */
  context?: 'row' | 'header';
  /** Reference time for "Today" and "Yesterday"; defaults to now. */
  now?: Date;
  locked?: boolean;
  className?: string;
};

/** When a call happened and how long it lasted: "Today, 14:32 · 8 min". */
export function CallMeta({
  startedAt,
  durationSec,
  locale,
  layout = 'inline',
  context = 'row',
  now,
  locked = false,
  className,
}: CallMetaProps) {
  if (locked) return <DecryptingPlaceholder className={cn('w-16', className)} />;
  const header = context === 'header';
  const when = header ? formatDateTime(startedAt, locale) : formatWhen(startedAt, locale, now);
  const duration = (
    <span>
      <span aria-hidden>
        {header ? formatDurationExact(durationSec, locale) : formatDuration(durationSec, locale)}
      </span>
      <span className="sr-only">{formatDuration(durationSec, locale, true)}</span>
    </span>
  );
  return (
    <span
      data-component="CallMeta"
      className={cn(
        'tabular text-muted-foreground text-sm',
        layout === 'stacked' ? 'inline-flex flex-col items-end' : 'whitespace-nowrap',
        className,
      )}
    >
      <time dateTime={startedAt.toISOString()}>{when}</time>
      {layout === 'inline' ? ' · ' : null}
      {duration}
    </span>
  );
}
