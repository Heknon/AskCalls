'use client';

import { Copy, Download, Printer } from 'lucide-react';
import { useId } from 'react';
import { Button } from '../primitives/button';
import { Checkbox } from '../primitives/checkbox';
import { Label } from '../primitives/label';

export type RecoveryCodeGridProps = {
  /** Eight groups of four characters. */
  groups: string[];
  onCopy: () => void;
  onDownload: () => void;
  onPrint: () => void;
  /** After copying: "Copied. Clear your clipboard after saving." */
  copiedMessage?: string;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
  labels: {
    /** "Recovery code, 8 groups". */
    list: string;
    group: (n: number) => string;
    copy: string;
    download: string;
    print: string;
    /** "I saved my recovery code somewhere safe". */
    saved: string;
  };
};

/** Shows the recovery code once, for the user to save. Groups stay in order 1 to 8 in both directions. */
export function RecoveryCodeGrid({
  groups,
  onCopy,
  onDownload,
  onPrint,
  copiedMessage,
  saved,
  onSavedChange,
  labels,
}: RecoveryCodeGridProps) {
  const checkId = useId();
  return (
    <div data-component="RecoveryCodeGrid" className="flex flex-col gap-4">
      <ol
        aria-label={labels.list}
        className="m-0 grid list-none grid-cols-2 gap-2 rounded-lg border border-border bg-card p-4 sm:grid-cols-4"
      >
        {groups.map((g, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: the position is the group's identity
            key={i}
            aria-label={`${labels.group(i + 1)}: ${g.split('').join(' ')}`}
            className="flex flex-col items-center gap-0.5 rounded-md bg-muted px-1 py-2.5"
          >
            <span aria-hidden className="tabular text-2xs text-muted-foreground">
              {i + 1}
            </span>
            <b aria-hidden dir="ltr" className="font-medium font-mono text-lg tracking-wider">
              {g}
            </b>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onDownload}>
          <Download className="size-4" aria-hidden />
          {labels.download}
        </Button>
        <Button variant="outline" size="sm" onClick={onPrint}>
          <Printer className="size-4" aria-hidden />
          {labels.print}
        </Button>
        <Button variant="outline" size="sm" onClick={onCopy}>
          <Copy className="size-4" aria-hidden />
          {labels.copy}
        </Button>
      </div>
      {copiedMessage ? (
        <p role="status" className="text-muted-foreground text-sm">
          {copiedMessage}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Checkbox id={checkId} checked={saved} onCheckedChange={(v) => onSavedChange(v === true)} />
        <Label htmlFor={checkId} className="font-normal text-base">
          {labels.saved}
        </Label>
      </div>
    </div>
  );
}
