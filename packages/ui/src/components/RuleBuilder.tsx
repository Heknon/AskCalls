'use client';

import { Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Button } from '../primitives/button';
import { Card } from '../primitives/card';
import { Input } from '../primitives/input';
import { Label } from '../primitives/label';
import { Switch } from '../primitives/switch';
import { type RuleSelect, RuleSelectField } from './RuleCondition';

export type RuleBuilderProps = {
  name: string;
  onNameChange: (name: string) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  /** "all" or "any" of the conditions. */
  match: RuleSelect;
  /** `RuleCondition`s. */
  conditions: ReactNode;
  onAddCondition: () => void;
  /** `RuleAction`s. */
  actions: ReactNode;
  onAddAction: () => void;
  /** "Matches 23 calls. Show them". */
  preview?: ReactNode;
  /** `JobProgress` while applying to existing calls. */
  job?: ReactNode;
  /** `SaveStatus`. */
  saveStatus?: ReactNode;
  onSave: () => void;
  onApply: () => void;
  onDelete: () => void;
  labels: {
    name: string;
    on: string;
    when: string;
    ofThese: string;
    actions: string;
    addCondition: string;
    addAction: string;
    save: string;
    apply: string;
    delete: string;
  };
};

/** Defines when a rule fires and what it does. Ctrl/⌘+Enter saves. */
export function RuleBuilder({
  name,
  onNameChange,
  enabled,
  onEnabledChange,
  match,
  conditions,
  onAddCondition,
  actions,
  onAddAction,
  preview,
  job,
  saveStatus,
  onSave,
  onApply,
  onDelete,
  labels,
}: RuleBuilderProps) {
  const switchId = useId();
  return (
    <Card
      data-component="RuleBuilder"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          onSave();
        }
      }}
    >
      <div className="flex items-center gap-3 border-border border-b px-5 py-4">
        <Input
          dir="auto"
          aria-label={labels.name}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="h-10 max-w-96 font-semibold md:text-md"
        />
        <span className="ms-auto flex items-center gap-2">
          <Switch id={switchId} checked={enabled} onCheckedChange={onEnabledChange} />
          <Label htmlFor={switchId} className="font-normal">
            {labels.on}
          </Label>
        </span>
      </div>
      <div className="flex flex-col gap-6 p-5">
        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2 font-semibold text-sm">
            {labels.when}
            <span className="w-24">
              <RuleSelectField select={match} />
            </span>
            {labels.ofThese}
          </div>
          {conditions}
          <div>
            <Button variant="ghost" size="sm" onClick={onAddCondition}>
              <Plus className="size-4" aria-hidden />
              {labels.addCondition}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="font-semibold text-sm">{labels.actions}</div>
          {actions}
          <div>
            <Button variant="ghost" size="sm" onClick={onAddAction}>
              <Plus className="size-4" aria-hidden />
              {labels.addAction}
            </Button>
          </div>
        </div>
        {preview ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">{preview}</div>
        ) : null}
        {job}
        <div className="flex flex-wrap items-center gap-2 border-border border-t pt-4">
          <Button variant="primary" onClick={onSave} aria-keyshortcuts="Control+Enter Meta+Enter">
            {labels.save}
          </Button>
          <Button variant="outline" onClick={onApply}>
            {labels.apply}
          </Button>
          <span className="flex-1" />
          {saveStatus}
          <Button variant="ghost" onClick={onDelete} className="text-destructive">
            <Trash2 className="size-4" aria-hidden />
            {labels.delete}
          </Button>
        </div>
      </div>
    </Card>
  );
}
