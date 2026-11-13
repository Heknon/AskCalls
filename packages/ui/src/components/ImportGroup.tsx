'use client';

import { ChevronDown, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from '../primitives/button';
import { Checkbox } from '../primitives/checkbox';

export type ImportGroupProps = {
  /** Who or what the calls share: a `ContactLabel`, a folder path, a month. */
  label: ReactNode;
  /** "12 calls" or "3 of 12 calls". */
  count: string;
  /** Whether the group's calls are in the import: all, none, or some. */
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  /** "Include calls with Dana Levi". */
  selectLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens the `ImportEditDialog` for the group's calls. `label`: "Edit calls with Dana Levi". */
  edit?: { label: string; onEdit: () => void };
  /** Columns of the table it sits in. */
  columns: number;
  /** `QueueRow`s with `select`, shown when open. */
  children: ReactNode;
};

/**
 * Calls of a bulk import that share a contact, folder or month, put in or left out together
 * before the import starts. A `tbody` of the queue table.
 */
export function ImportGroup({
  label,
  count,
  checked,
  onCheckedChange,
  selectLabel,
  open,
  onOpenChange,
  edit,
  columns,
  children,
}: ImportGroupProps) {
  return (
    <tbody data-component="ImportGroup" data-state={open ? 'open' : 'closed'}>
      <tr className="border-border border-b bg-muted/40">
        <td colSpan={columns} className="px-4 py-2.5 md:px-3">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={checked}
              onCheckedChange={(v) => onCheckedChange(v === true)}
              aria-label={selectLabel}
            />
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onOpenChange(!open)}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-start"
            >
              <span className={cn('min-w-0 flex-1 truncate', checked === false && 'opacity-60')}>
                {label}
              </span>
              <span className="tabular shrink-0 text-muted-foreground text-sm">{count}</span>
              <ChevronDown
                className={cn(
                  'size-4 shrink-0 text-muted-foreground transition-transform duration-(--duration-base)',
                  open && 'rotate-180',
                )}
                aria-hidden
              />
            </button>
            {edit ? (
              <Button variant="ghost" size="icon-sm" aria-label={edit.label} onClick={edit.onEdit}>
                <Pencil className="size-4" aria-hidden />
              </Button>
            ) : null}
          </div>
        </td>
      </tr>
      {open ? children : null}
    </tbody>
  );
}
