import { type ReactNode, useId } from 'react';
import { Card } from '../primitives/card';
import { Label } from '../primitives/label';
import { Switch } from '../primitives/switch';

export type PreflightSummaryProps = {
  /** "Import summary". */
  title: string;
  /** "61 audio only, will be transcribed", … */
  counts: { n: number; label: string }[];
  locale: string;
  /** The `UsageMeter` with transcription after this import. */
  usage?: ReactNode;
  /** "About 214 minutes of audio to transcribe." */
  note?: string;
  /** The `DataFlowNote` for transcription. */
  dataFlow: ReactNode;
  backup?: { checked: boolean; onChange: (v: boolean) => void; label: string };
};

/** What an import will do before it starts: counts, transcription minutes and the data flow. */
export function PreflightSummary({
  title,
  counts,
  locale,
  usage,
  note,
  dataFlow,
  backup,
}: PreflightSummaryProps) {
  const id = useId();
  const n = new Intl.NumberFormat(locale);
  return (
    <Card data-component="PreflightSummary" className="flex flex-col gap-4 p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3">
        {counts.map((c) => (
          <div key={c.label} className="rounded-md border border-border bg-card px-4 py-3.5">
            <b className="tabular block font-semibold text-xl">{n.format(c.n)}</b>
            <span className="text-muted-foreground text-sm">{c.label}</span>
          </div>
        ))}
      </div>
      {usage}
      {note ? <p className="text-muted-foreground text-sm">{note}</p> : null}
      {dataFlow}
      {backup ? (
        <div className="flex items-center gap-2.5">
          <Switch id={id} checked={backup.checked} onCheckedChange={backup.onChange} />
          <Label htmlFor={id} className="font-normal">
            {backup.label}
          </Label>
        </div>
      ) : null}
    </Card>
  );
}
