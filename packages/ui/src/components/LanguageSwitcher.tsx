'use client';

import { Languages } from 'lucide-react';
import { Button } from '../primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';

export type LanguageOption = {
  /** Locale code: "en", "he". */
  value: string;
  /** The language's name in itself: "English", "עברית". */
  label: string;
};

export type LanguageSwitcherProps = {
  value: string;
  options: LanguageOption[];
  onChange: (value: string) => void;
  /** "Language". */
  label: string;
  /** While the choice is being saved. */
  busy?: boolean;
};

/**
 * Chooses the UI language. With two languages it is one button naming the other language in
 * that language ("עברית" on the English UI); with more, a menu of every language.
 */
export function LanguageSwitcher({ value, options, onChange, label, busy }: LanguageSwitcherProps) {
  const others = options.filter((o) => o.value !== value);
  const current = options.find((o) => o.value === value);
  if (others.length === 1) {
    const other = others[0]!;
    return (
      <Button
        data-component="LanguageSwitcher"
        variant="ghost"
        size="sm"
        loading={busy}
        aria-label={`${label}: ${other.label}`}
        onClick={() => onChange(other.value)}
      >
        <Languages className="size-4" aria-hidden />
        <span lang={other.value}>{other.label}</span>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-component="LanguageSwitcher"
          variant="ghost"
          size="sm"
          loading={busy}
          aria-label={`${label}: ${current?.label ?? value}`}
        >
          <Languages className="size-4" aria-hidden />
          <span lang={value}>{current?.label ?? value}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} lang={o.value}>
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
