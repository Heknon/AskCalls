import { cn } from '../lib/cn';

export type FingerprintCodeProps = {
  /** Six digits, e.g. "482913". */
  digits: string;
  size?: 'md' | 'lg';
  className?: string;
};

/** The 6-digit fingerprint both devices must show while linking. Read digit by digit. */
export function FingerprintCode({ digits, size = 'lg', className }: FingerprintCodeProps) {
  const half = Math.ceil(digits.length / 2);
  const a = digits.slice(0, half);
  const b = digits.slice(half);
  return (
    <div
      data-component="FingerprintCode"
      role="img"
      dir="ltr"
      aria-label={`${a.split('').join(' ')}, ${b.split('').join(' ')}`}
      className={cn(
        'ltr-island font-medium font-mono tabular leading-none tracking-wider',
        size === 'lg' ? 'text-4xl max-md:text-3xl' : 'text-2xl',
        className,
      )}
    >
      {a}
      <span className="inline-block w-[0.5em]" />
      {b}
    </div>
  );
}
