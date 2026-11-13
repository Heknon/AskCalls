import { WifiOff } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { Card } from '../primitives/card';
import { Switch } from '../primitives/switch';

export type OfflineBlocker = {
  key: string;
  /** "Transcription: ElevenLabs". */
  what: string;
  /** "api.elevenlabs.io". */
  host: string;
  /** One-click fixes; the first is the suggested one. */
  fixes: { label: string; onFix: () => void }[];
};

export type OfflineBlockerListProps = {
  title: string;
  /** "3 settings reach the internet. Fix them to turn offline mode on." */
  summary: string;
  blockers: OfflineBlocker[];
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
};

/** Every configured setting that would reach the internet, each with its fix. */
export function OfflineBlockerList({
  title,
  summary,
  blockers,
  enabled,
  onEnabledChange,
}: OfflineBlockerListProps) {
  const id = useId();
  const blocked = blockers.length > 0;
  return (
    <Card data-component="OfflineBlockerList" className={cn(blocked && 'border-warning')}>
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-warning-subtle text-warning-subtle-foreground">
          <WifiOff className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id} className="font-semibold">
            {title}
          </h2>
          <p className="text-muted-foreground text-sm">{summary}</p>
        </div>
        <Switch
          aria-labelledby={id}
          checked={enabled}
          disabled={blocked}
          onCheckedChange={onEnabledChange}
        />
      </div>
      {blocked ? (
        <ul className="m-0 flex list-none flex-col px-5 pb-2">
          {blockers.map((b) => (
            <li
              key={b.key}
              className="grid grid-cols-1 items-center gap-x-4 gap-y-2 border-border border-t py-3 md:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="flex flex-col gap-0.5">
                <strong className="font-semibold">{b.what}</strong>
                <bdi dir="ltr" className="self-start font-mono text-muted-foreground text-xs">
                  {b.host}
                </bdi>
              </div>
              <div className="flex flex-wrap gap-2">
                {b.fixes.map((f, i) => (
                  <Button
                    key={f.label}
                    variant={i === 0 ? 'outline' : 'ghost'}
                    size="sm"
                    onClick={f.onFix}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
