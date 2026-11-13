'use client';

import { Download } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../primitives/accordion';
import { Button } from '../primitives/button';
import { CopyableCode } from './CopyableCode';

export type ImportFormatGuideProps = {
  /** "Folder layout and manifest.csv". */
  title: string;
  /** How recordings and transcripts pair, one line. */
  pairing: string;
  /** An example folder, one path per line. Always LTR. */
  tree: string;
  /** What manifest.csv sets, one line. */
  manifest: string;
  /** An example manifest.csv. */
  csv: string;
  /** Each column of manifest.csv and what it takes. */
  columns: { name: string; note: string }[];
  labels: { copy: string; copied: string; download: string };
  onDownload: () => void;
};

/** The folder layout and manifest.csv a bulk import reads, with examples. Closed until opened. */
export function ImportFormatGuide({
  title,
  pairing,
  tree,
  manifest,
  csv,
  columns,
  labels,
  onDownload,
}: ImportFormatGuideProps) {
  return (
    <Accordion type="single" collapsible data-component="ImportFormatGuide">
      <AccordionItem value="guide" className="border-b-0">
        <AccordionTrigger className="py-2 text-sm">{title}</AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-4 pt-2">
            <p className="text-sm">{pairing}</p>
            <pre
              dir="ltr"
              className="m-0 overflow-x-auto rounded-md border border-border bg-muted px-3.5 py-3 text-left font-mono text-sm leading-5.5"
            >
              {tree}
            </pre>
            <p className="text-sm">{manifest}</p>
            <CopyableCode
              code={csv}
              language="csv"
              labels={{ copy: labels.copy, copied: labels.copied }}
            />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
              {columns.map((c) => (
                <div key={c.name} className="contents">
                  <dt dir="ltr" className="text-start font-mono">
                    {c.name}
                  </dt>
                  <dd className="m-0 text-muted-foreground">{c.note}</dd>
                </div>
              ))}
            </dl>
            <Button variant="outline" size="sm" className="self-start" onClick={onDownload}>
              <Download className="size-4" aria-hidden />
              {labels.download}
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
