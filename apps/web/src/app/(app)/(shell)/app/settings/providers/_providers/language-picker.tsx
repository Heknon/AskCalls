'use client';

import { Button } from '@askcalls/ui/primitives/button';
import { Input } from '@askcalls/ui/primitives/input';
import { Popover, PopoverContent, PopoverTrigger } from '@askcalls/ui/primitives/popover';
import { Check, ChevronDown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { languageOptions, matchesLanguage } from '../../../../../../../client/i18n/language-names';

/**
 * A searchable list of ISO 639-1 languages by their own names, the common ones first. `any`
 * adds the "Any other language" entry used by a rule's source.
 */
export function LanguagePicker({
  value,
  onPick,
  exclude = [],
  any = false,
  label,
  trigger,
}: {
  value: string | null;
  onPick: (code: string) => void;
  /** Codes that cannot be picked here (already used). */
  exclude?: readonly string[];
  any?: boolean;
  label: string;
  trigger: ReactNode;
}) {
  const t = useTranslations('settings.prov.rules');
  const locale = useLocale();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const options = useMemo(() => languageOptions(locale), [locale]);
  const shown = options.filter((o) => !exclude.includes(o.code) && matchesLanguage(o, query));
  const pick = (code: string) => {
    onPick(code);
    setOpen(false);
    setQuery('');
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={label} className="justify-between gap-2">
          {trigger}
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col p-2">
        <Input
          id={`${id}-q`}
          aria-label={t('search')}
          placeholder={t('search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-2"
          autoFocus
        />
        <ul aria-label={label} className="m-0 max-h-64 list-none overflow-y-auto p-0">
          {any && !exclude.includes('any') && !query ? (
            <Option selected={value === 'any'} onPick={() => pick('any')}>
              {t('any')}
            </Option>
          ) : null}
          {shown.map((o) => (
            <Option key={o.code} selected={value === o.code} onPick={() => pick(o.code)}>
              <bdi lang={o.code}>{o.native}</bdi>
              {o.local !== o.native ? (
                <span className="text-muted-foreground text-xs">{o.local}</span>
              ) : null}
            </Option>
          ))}
          {shown.length === 0 ? (
            <li className="px-2 py-1.5 text-muted-foreground text-sm">{t('noLanguage')}</li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function Option({
  selected,
  onPick,
  children,
}: {
  selected: boolean;
  onPick: () => void;
  children: ReactNode;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onPick}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
      >
        <Check className={selected ? 'size-3.5' : 'size-3.5 opacity-0'} aria-hidden />
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">{children}</span>
      </button>
    </li>
  );
}
