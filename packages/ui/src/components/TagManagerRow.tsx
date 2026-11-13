'use client';

import { Check, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { TAG_COLOURS, type TagColour, tagDotClass } from '../lib/tag-colour';
import { Button } from '../primitives/button';
import { Input } from '../primitives/input';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
import { ConfirmDialog } from './ConfirmDialog';
import { TagChip } from './TagChip';

export type TagManagerRowProps = {
  name: string;
  colour: TagColour;
  /** "23 calls". */
  usage: string;
  onRename: (name: string) => void;
  onColourChange: (colour: TagColour) => void;
  onDelete: () => void;
  labels: {
    colour: string;
    colourNames: Record<TagColour, string>;
    rename: string;
    save: string;
    delete: string;
    deleteTitle: string;
    deleteBody: string;
    cancel: string;
  };
};

/** One tag in the tag manager: colour, name, how many calls use it, and its actions. */
export function TagManagerRow({
  name,
  colour,
  usage,
  onRename,
  onColourChange,
  onDelete,
  labels,
}: TagManagerRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const save = () => {
    const v = draft.trim();
    if (v) onRename(v);
    setEditing(false);
  };
  return (
    <div
      data-component="TagManagerRow"
      className="flex flex-wrap items-center gap-3 border-border border-b px-4 py-3 last:border-b-0"
    >
      <Popover>
        <PopoverTrigger
          aria-label={`${labels.colour}: ${labels.colourNames[colour]}`}
          className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
        >
          <span className={cn('size-3 rounded-full', tagDotClass[colour])} />
        </PopoverTrigger>
        <PopoverContent className="grid grid-cols-4 gap-1 p-2" aria-label={labels.colour}>
          {TAG_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={labels.colourNames[c]}
              aria-pressed={c === colour}
              onClick={() => onColourChange(c)}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent aria-pressed:bg-accent"
            >
              <span
                className={cn(
                  'inline-flex size-4 items-center justify-center rounded-full text-card',
                  tagDotClass[c],
                )}
              >
                {c === colour ? <Check className="size-3" strokeWidth={3} aria-hidden /> : null}
              </span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            dir="auto"
            autoFocus
            aria-label={labels.rename}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDraft(name);
                setEditing(false);
              }
            }}
            className="h-8 max-w-64"
          />
          <Button type="submit" variant="primary" size="sm">
            {labels.save}
          </Button>
        </form>
      ) : (
        <span className="min-w-0 flex-1">
          <TagChip name={name} colour={colour} />
        </span>
      )}
      <span className="tabular text-muted-foreground text-sm">{usage}</span>
      <span className="flex gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${labels.rename} ${name}`}
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
        >
          <Pencil className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`${labels.delete} ${name}`}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </span>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={labels.deleteTitle}
        description={labels.deleteBody}
        confirmLabel={labels.delete}
        cancelLabel={labels.cancel}
        onConfirm={onDelete}
      />
    </div>
  );
}
