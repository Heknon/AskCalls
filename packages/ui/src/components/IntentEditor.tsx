'use client';

import { Lightbulb } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Badge } from '../primitives/badge';
import { Card } from '../primitives/card';
import { Input } from '../primitives/input';
import { Label } from '../primitives/label';
import { Slider } from '../primitives/slider';
import { Textarea } from '../primitives/textarea';

export type IntentEditorProps = {
  name: string;
  onNameChange: (name: string) => void;
  /** Built-ins can't be renamed or deleted; their examples can be extended. */
  builtIn?: boolean;
  /** One example sentence per line. */
  examples: string;
  onExamplesChange: (examples: string) => void;
  /** How close a call must be, 0 to 1. */
  threshold: number;
  onThresholdChange: (threshold: number) => void;
  /** `SaveStatus`. */
  saveStatus?: ReactNode;
  labels: {
    name: string;
    builtIn: string;
    examples: string;
    examplesHint: string;
    threshold: string;
    looser: string;
    stricter: string;
  };
};

/** An intent with its example sentences and match threshold. */
export function IntentEditor({
  name,
  onNameChange,
  builtIn = false,
  examples,
  onExamplesChange,
  threshold,
  onThresholdChange,
  saveStatus,
  labels,
}: IntentEditorProps) {
  const id = useId();
  return (
    <Card data-component="IntentEditor" className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Lightbulb className="size-4.5 text-muted-foreground" aria-hidden />
        {builtIn ? (
          <h3 dir="auto" className="font-semibold text-md">
            {name}
          </h3>
        ) : (
          <Input
            dir="auto"
            aria-label={labels.name}
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="h-9 max-w-72 font-semibold"
          />
        )}
        {builtIn ? <Badge>{labels.builtIn}</Badge> : null}
        <span className="ms-auto">{saveStatus}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-ex`}>{labels.examples}</Label>
        <Textarea
          id={`${id}-ex`}
          dir="auto"
          value={examples}
          onChange={(e) => onExamplesChange(e.target.value)}
          aria-describedby={`${id}-hint`}
          className="min-h-28"
        />
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {labels.examplesHint}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label id={`${id}-th`}>{labels.threshold}</Label>
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={[threshold]}
          onValueChange={([v]) => onThresholdChange(v ?? threshold)}
          thumbLabel={labels.threshold}
          valueText={`${Math.round(threshold * 100)}%`}
        />
        <div className="flex justify-between text-muted-foreground text-xs">
          <span>{labels.looser}</span>
          <span>{labels.stricter}</span>
        </div>
      </div>
    </Card>
  );
}
