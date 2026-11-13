'use client';

import { Phone, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '../primitives/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog';
import { Input } from '../primitives/input';
import { Label } from '../primitives/label';
import { ToggleGroup, ToggleGroupItem } from '../primitives/toggle-group';
import { ErrorState } from './ErrorState';

export type ImportEditDirection = 'in' | 'out' | 'unknown';

export type ImportEditValues = {
  phone: string;
  contactName: string;
  /** `datetime-local` value, local time. */
  startedAt: string;
  direction: ImportEditDirection;
};

export type ImportEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Edit 25 calls" or the file name. */
  title: string;
  /** "Fields you leave as they are keep each call's value." For more than one call. */
  description?: string;
  /** The calls' current values; a field left out differs between the calls. */
  values: Partial<ImportEditValues>;
  /** Only for one call: a group's calls each keep their own time. */
  date: boolean;
  /** Saved contact names, offered as the name is typed. */
  contactNames: readonly string[];
  /** Null when the number parses or is empty. */
  phoneError: (phone: string) => string | null;
  /** The fields the user changed. */
  onSave: (changed: Partial<ImportEditValues>) => void;
  /** Shown when the calls were edited before: back to the file names and manifest. */
  onRevert?: () => void;
  labels: {
    phone: string;
    phoneHint: string;
    contactName: string;
    date: string;
    direction: string;
    in: string;
    out: string;
    unknown: string;
    /** Placeholder of a field whose calls differ. */
    mixed: string;
    save: string;
    cancel: string;
    revert: string;
    close: string;
  };
};

/**
 * Corrects the number, contact, time and direction of one planned call of a bulk import, or of
 * a group of them at once, before the import starts. Only changed fields are applied.
 */
export function ImportEditDialog(props: ImportEditDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent closeLabel={props.labels.close} data-component="ImportEditDialog">
        {props.open ? <EditForm {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({
  onOpenChange,
  title,
  description,
  values,
  date,
  contactNames,
  phoneError,
  onSave,
  onRevert,
  labels,
}: ImportEditDialogProps) {
  const id = useId();
  const [form, setForm] = useState<Partial<ImportEditValues>>(values);
  const [changed, setChanged] = useState<ReadonlySet<keyof ImportEditValues>>(new Set());
  const set = <K extends keyof ImportEditValues>(k: K, v: ImportEditValues[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setChanged((c) => new Set(c).add(k));
  };
  const error = changed.has('phone') ? phoneError(form.phone ?? '') : null;
  const field = (k: keyof ImportEditValues) => `${id}-${k}`;
  const save = () => {
    const out: Partial<ImportEditValues> = {};
    for (const k of changed) Object.assign(out, { [k]: form[k] });
    onSave(out);
    onOpenChange(false);
  };

  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (!error) save();
      }}
    >
      <DialogHeader>
        <DialogTitle>
          <bdi>{title}</bdi>
        </DialogTitle>
        {description ? <DialogDescription>{description}</DialogDescription> : null}
      </DialogHeader>
      <DialogBody>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={field('contactName')}>{labels.contactName}</Label>
          <Input
            id={field('contactName')}
            dir="auto"
            list={`${field('contactName')}-list`}
            autoComplete="off"
            value={form.contactName ?? ''}
            placeholder={values.contactName === undefined ? labels.mixed : undefined}
            onChange={(e) => set('contactName', e.target.value)}
          />
          <datalist id={`${field('contactName')}-list`}>
            {contactNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={field('phone')}>{labels.phone}</Label>
          <Input
            id={field('phone')}
            dir="ltr"
            inputMode="tel"
            autoComplete="off"
            value={form.phone ?? ''}
            placeholder={values.phone === undefined ? labels.mixed : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${field('phone')}-hint`}
            onChange={(e) => set('phone', e.target.value)}
          />
          {error ? (
            <span id={`${field('phone')}-hint`}>
              <ErrorState scope="inline" title={error} />
            </span>
          ) : (
            <p id={`${field('phone')}-hint`} className="text-muted-foreground text-sm">
              {labels.phoneHint}
            </p>
          )}
        </div>
        {date ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={field('startedAt')}>{labels.date}</Label>
            <Input
              id={field('startedAt')}
              type="datetime-local"
              value={form.startedAt ?? ''}
              onChange={(e) => set('startedAt', e.target.value)}
            />
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label id={field('direction')}>{labels.direction}</Label>
          <ToggleGroup
            type="single"
            aria-labelledby={field('direction')}
            value={form.direction ?? ''}
            onValueChange={(v) => v && set('direction', v as ImportEditDirection)}
            className="w-full"
          >
            <ToggleGroupItem value="in">
              <PhoneIncoming aria-hidden />
              {labels.in}
            </ToggleGroupItem>
            <ToggleGroupItem value="out">
              <PhoneOutgoing aria-hidden />
              {labels.out}
            </ToggleGroupItem>
            <ToggleGroupItem value="unknown">
              <Phone aria-hidden />
              {labels.unknown}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </DialogBody>
      <DialogFooter>
        {onRevert ? (
          <Button
            type="button"
            variant="ghost"
            className="me-auto"
            onClick={() => {
              onRevert();
              onOpenChange(false);
            }}
          >
            {labels.revert}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {labels.cancel}
        </Button>
        <Button type="submit" variant="primary" disabled={changed.size === 0 || !!error}>
          {labels.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
