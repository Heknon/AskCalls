import { cn } from '../lib/cn';

export type LogoProps = {
  /** The product name next to the mark; omit for the mark alone. */
  name?: string;
  size?: 'sm' | 'md';
  /**
   * `tile`: the mark on its accent tile (app chrome, icons). `bare`: the bars alone in the
   * accent colour, for the marketing header and footer, where the wordmark runs inline with
   * navigation on both the dark and the light grounds.
   */
  variant?: 'tile' | 'bare';
  className?: string;
};

/** The AskCalls mark: waveform bars and a key block on the accent tile. */
export function Logo({ name, size = 'md', variant = 'tile', className }: LogoProps) {
  const px = size === 'sm' ? 24 : 26;
  return (
    <span
      data-component="Logo"
      className={cn(
        'inline-flex items-center gap-2 font-semibold text-foreground text-md tracking-tight',
        className,
      )}
    >
      {variant === 'bare' ? (
        <svg width={px} height={px} viewBox="6 4 24 24" aria-hidden className="shrink-0">
          <g className="stroke-primary" strokeWidth="2.6" strokeLinecap="round">
            <line x1="9" y1="13" x2="9" y2="19" />
            <line x1="13" y1="10" x2="13" y2="22" />
            <line x1="17" y1="12.5" x2="17" y2="19.5" />
            <line x1="21" y1="9" x2="21" y2="23" />
          </g>
          <rect x="23.6" y="5" width="4.4" height="4.4" rx="1.2" className="fill-primary" />
        </svg>
      ) : (
        <svg width={px} height={px} viewBox="0 0 32 32" aria-hidden className="shrink-0">
          <rect width="32" height="32" rx="8" className="fill-primary" />
          <g className="stroke-primary-foreground" strokeWidth="2.4" strokeLinecap="round">
            <line x1="9" y1="13" x2="9" y2="19" />
            <line x1="13" y1="10" x2="13" y2="22" />
            <line x1="17" y1="12.5" x2="17" y2="19.5" />
            <line x1="21" y1="9" x2="21" y2="23" />
          </g>
          <rect
            x="23.6"
            y="5"
            width="4.4"
            height="4.4"
            rx="1.2"
            className="fill-primary-foreground"
            opacity=".9"
          />
        </svg>
      )}
      {name ? <span>{name}</span> : null}
    </span>
  );
}
