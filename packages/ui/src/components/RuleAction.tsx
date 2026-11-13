'use client';

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { RemoveButton, type RuleSelect, RuleSelectField, ruleRowClass } from './RuleCondition';

export type RuleActionProps = {
  /** What happens: Add tag, Star the call. */
  action: RuleSelect;
  /** The action's value (the tag), when it has one. */
  children?: ReactNode;
  onRemove: () => void;
  removeLabel: string;
};

/** One action: "Add tag …", "Star the call". */
export function RuleAction({ action, children, onRemove, removeLabel }: RuleActionProps) {
  return (
    <div
      data-component="RuleAction"
      className={cn(ruleRowClass, 'md:grid-cols-[10rem_minmax(0,1fr)_auto]')}
    >
      <RuleSelectField select={action} />
      <div className="min-w-0">{children}</div>
      <RemoveButton onRemove={onRemove} label={removeLabel} />
    </div>
  );
}
