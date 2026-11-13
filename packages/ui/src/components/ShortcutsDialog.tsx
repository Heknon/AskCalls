'use client';

import { Fragment } from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog';
import { Kbd } from './Kbd';

export type ShortcutGroup = {
  title: string;
  /** `keys` lists the keys pressed together or in sequence: ["g", "c"], ["⇧", "L"]. */
  items: { label: string; keys: string[] }[];
};

export type ShortcutsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Two columns on wide screens; each column is a list of groups. */
  columns: ShortcutGroup[][];
  /** "Single-key shortcuts can be turned off in Settings → Privacy." */
  note?: string;
  closeLabel: string;
};

/** Every keyboard shortcut available in the current context (`?`). */
export function ShortcutsDialog({
  open,
  onOpenChange,
  title,
  columns,
  note,
  closeLabel,
}: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-component="ShortcutsDialog"
        closeLabel={closeLabel}
        className="md:max-w-160"
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {note ? <DialogDescription className="sr-only">{note}</DialogDescription> : null}
        </DialogHeader>
        <DialogBody className="grid gap-x-8 md:grid-cols-2">
          {columns.map((groups, c) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed layout columns
            <div key={c}>
              {groups.map((g) => (
                <Fragment key={g.title}>
                  <h3 className="mt-3 mb-1 font-semibold text-sm">{g.title}</h3>
                  <dl>
                    {g.items.map((it) => (
                      <div
                        key={it.label}
                        className="flex items-center justify-between border-border border-b py-1.5 text-sm"
                      >
                        <dt>{it.label}</dt>
                        <dd className="flex gap-1">
                          {it.keys.map((k) => (
                            <Kbd key={k}>{k}</Kbd>
                          ))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Fragment>
              ))}
              {c === columns.length - 1 && note ? (
                <p aria-hidden className="mt-4 text-muted-foreground text-sm">
                  {note}
                </p>
              ) : null}
            </div>
          ))}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
