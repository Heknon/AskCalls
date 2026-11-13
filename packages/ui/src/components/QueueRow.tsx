import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../primitives/button';
import { ContactLabel, type ContactLabelProps } from './ContactLabel';
import { QueueItemStatus, type QueueItemStatusProps } from './QueueItemStatus';

export type QueueRowProps = {
  /** The file name the user chose; shown locally only. */
  fileName: string;
  /** What the item pairs: "Audio", "Transcript". */
  parts: string[];
  contact?: ContactLabelProps;
  status: QueueItemStatusProps;
  /** Duplicates: a link to the existing call. */
  duplicateOf?: ReactNode;
  retry?: { label: string; onRetry: () => void };
};

/** One file, or audio and transcript pair, in the import queue. A table row; a card on phones. */
export function QueueRow({ fileName, parts, contact, status, duplicateOf, retry }: QueueRowProps) {
  return (
    <tr
      data-component="QueueRow"
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-border border-b px-4 py-3 last:border-b-0 md:table-row md:p-0"
    >
      <td className="min-w-0 md:max-w-88 md:px-3 md:py-2.5">
        <bdi dir="ltr" title={fileName} className="block truncate text-start font-mono text-sm">
          {fileName}
        </bdi>
        <span className="mt-1 flex gap-1">
          {parts.map((p) => (
            <span
              key={p}
              className="rounded-xs bg-muted px-1.5 py-px font-medium text-2xs text-muted-foreground"
            >
              {p}
            </span>
          ))}
        </span>
      </td>
      <td className="col-start-1 text-muted-foreground md:px-3 md:py-2.5 md:text-foreground">
        {contact ? <ContactLabel show="auto" {...contact} /> : null}
      </td>
      <td className="col-start-2 row-start-1 md:px-3 md:py-2.5">
        <QueueItemStatus {...status} />
        {duplicateOf ? <div className="mt-1 text-xs">{duplicateOf}</div> : null}
      </td>
      <td className="col-start-2 row-start-2 text-end md:px-3 md:py-2.5">
        {retry ? (
          <Button variant="ghost" size="sm" onClick={retry.onRetry}>
            <RotateCcw className="size-3.5" aria-hidden />
            {retry.label}
          </Button>
        ) : null}
      </td>
    </tr>
  );
}
