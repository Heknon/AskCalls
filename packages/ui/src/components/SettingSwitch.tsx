'use client';

import { useId } from 'react';
import { Switch } from '../primitives/switch';

export type SettingSwitchProps = {
  label: string;
  /** One line on what turning it on or off changes. */
  hint?: string | undefined;
  checked: boolean;
  disabled?: boolean | undefined;
  onChange: (checked: boolean) => void;
};

/** A yes/no setting: label and hint at the start, the switch at the end. */
export function SettingSwitch({ label, hint, checked, disabled, onChange }: SettingSwitchProps) {
  const id = useId();
  return (
    <div data-component="SettingSwitch" className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col">
        <label htmlFor={id}>{label}</label>
        {hint ? <span className="text-muted-foreground text-sm">{hint}</span> : null}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
