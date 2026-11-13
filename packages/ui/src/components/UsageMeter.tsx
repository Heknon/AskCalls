import { cn } from '../lib/cn';
import { Progress } from '../primitives/progress';

export type UsageMeterProps = {
  /** "Managed transcription this month". */
  label: string;
  used: number;
  limit: number;
  /** "min", "GB", "calls". */
  unit: string;
  locale: string;
  className?: string;
};

/** Use of a limited resource. Turns warning at 80 % and destructive at 100 %. */
export function UsageMeter({ label, used, limit, unit, locale, className }: UsageMeterProps) {
  const ratio = limit > 0 ? used / limit : 0;
  const tone = ratio >= 1 ? 'destructive' : ratio >= 0.8 ? 'warning' : 'primary';
  const n = new Intl.NumberFormat(locale);
  return (
    <div
      data-component="UsageMeter"
      data-tone={tone}
      className={cn('flex flex-col gap-1.5', className)}
    >
      <div className="flex justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="tabular whitespace-nowrap text-muted-foreground">
          <bdi dir="ltr">
            {n.format(used)} / {n.format(limit)}
          </bdi>{' '}
          {unit}
        </span>
      </div>
      <Progress
        value={Math.min(used, limit)}
        max={limit}
        tone={tone}
        aria-label={label}
        aria-valuetext={`${n.format(used)} / ${n.format(limit)} ${unit}`}
      />
    </div>
  );
}
