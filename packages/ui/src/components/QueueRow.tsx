import { Pencil, RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
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
  /** Before an import starts: opens the `ImportEditDialog`. `label`: "Edit {file}". */
  edit?: { label: string; onEdit: () => void };
  /**
   * Before an import starts: whether this call is in it, and the `Checkbox` that changes it
   * (passed in, so the queue view doesn't load it). Left-out rows are dimmed.
   */
  select?: { checked: boolean; control: ReactNode };
};

/** One file, or audio and transcript pair, in the import queue. A table row; a card on phones. */
export function QueueRow({
  fileName,
  parts,
  contact,
  status,
  duplicateOf,
  retry,
  edit,
  select,
}: QueueRowProps) {
  const name = (
    <>
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
    </>
  );
  return (
    <tr
      data-component="QueueRow"
      data-selected={select ? select.checked : undefined}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-border border-b px-4 py-3 last:border-b-0 md:table-row md:p-0',
        select && !select.checked && 'opacity-60',
      )}
    >
      <td className="min-w-0 md:max-w-88 md:px-3 md:py-2.5">
        {select ? (
          <span className="flex items-start gap-3">
            <span className="mt-0.5 flex">{select.control}</span>
            <span className="min-w-0">{name}</span>
          </span>
        ) : (
          name
        )}
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
        {edit ? (
          <Button variant="ghost" size="icon-sm" aria-label={edit.label} onClick={edit.onEdit}>
            <Pencil className="size-4" aria-hidden />
          </Button>
        ) : null}
      </td>
    </tr>
  );
}
