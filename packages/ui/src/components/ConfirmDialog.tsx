'use client';

import { type ReactNode, useId, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../primitives/alert-dialog';
import { Input } from '../primitives/input';
import { Label } from '../primitives/label';

export type ConfirmDialogProps = {
  /** "Delete this call?" */
  title: string;
  /** Exactly what will be lost: "The transcript, notes, tags and recording are deleted for good." */
  description: string;
  /** The verb: "Delete call". */
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The control that opens it, when not controlled. */
  trigger?: ReactNode;
  /**
   * For the gravest actions (delete account): the confirm button stays disabled until the user
   * types `value` exactly. `label` says what to type ("Type dana@example.com to confirm").
   */
  typeToConfirm?: { label: string; value: string };
};

/** Confirms an irreversible action. Focus starts on Cancel. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  open,
  onOpenChange,
  trigger,
  typeToConfirm,
}: ConfirmDialogProps) {
  const id = useId();
  const [typed, setTyped] = useState('');
  const blocked = typeToConfirm !== undefined && typed.trim() !== typeToConfirm.value;
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setTyped('');
        onOpenChange?.(o);
      }}
    >
      {trigger ? <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger> : null}
      <AlertDialogContent data-component="ConfirmDialog">
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {typeToConfirm ? (
          <div className="flex flex-col gap-1.5 px-6 pb-5">
            <Label htmlFor={id}>{typeToConfirm.label}</Label>
            <Input
              id={id}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction disabled={blocked} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
