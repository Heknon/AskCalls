'use client';

import { Textarea } from '../primitives/textarea';
import { SaveStatus, type SaveStatusProps } from './SaveStatus';

export type NotesEditorProps = {
  value: string;
  /** The screen autosaves 800 ms after typing stops. */
  onChange: (value: string) => void;
  /** "Notes": the field's name and placeholder. */
  label: string;
  save?: Pick<SaveStatusProps, 'state' | 'onRetry'>;
  saveLabels: SaveStatusProps['labels'];
  locked?: boolean;
};

/** Private notes on a call, saved as you type. */
export function NotesEditor({
  value,
  onChange,
  label,
  save,
  saveLabels,
  locked,
}: NotesEditorProps) {
  return (
    <div data-component="NotesEditor" className="flex flex-col gap-2">
      <Textarea
        dir="auto"
        aria-label={label}
        placeholder={label}
        value={value}
        disabled={locked}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-40 text-md leading-6.5"
      />
      {save ? <SaveStatus {...save} labels={saveLabels} className="self-end" /> : null}
    </div>
  );
}
