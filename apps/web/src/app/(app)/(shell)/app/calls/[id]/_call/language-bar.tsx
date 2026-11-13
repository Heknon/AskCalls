'use client';

import { Toggle } from '@askcalls/ui/primitives/toggle';
import { ToggleGroup, ToggleGroupItem } from '@askcalls/ui/primitives/toggle-group';
import { Columns2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { nativeName } from '../../../../../../../client/i18n/language-names';
import { providerName } from '../../../settings/providers/_providers/registry';
import { ORIGINAL, type useTranscriptView } from './transcript-view';

/**
 * Original / each translation, by its own name ("English", "עברית"), and side by side on wide
 * screens. A translation shown carries a one-line machine-translation note.
 */
export function LanguageBar({
  tv,
  originalLanguage,
  providers,
}: {
  tv: ReturnType<typeof useTranscriptView>;
  originalLanguage: string | null;
  /** The LLM that made each translation, by language. */
  providers: Record<string, string>;
}) {
  const t = useTranslations('call.lang');
  if (tv.langs.length === 0) return null;
  const translated = tv.shown.find((c) => c.view !== ORIGINAL);
  return (
    <div data-component="LanguageBar" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          aria-label={t('label')}
          value={tv.view}
          onValueChange={(v) => v && tv.setView(v)}
        >
          <ToggleGroupItem value={ORIGINAL}>
            {t('original')}
            {originalLanguage ? (
              <span className="text-muted-foreground text-xs uppercase">{originalLanguage}</span>
            ) : null}
          </ToggleGroupItem>
          {tv.langs.map((l) => (
            <ToggleGroupItem key={l} value={l} lang={l}>
              {nativeName(l)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {tv.wide ? (
          <Toggle
            variant="chip"
            className="h-8"
            pressed={tv.columns}
            onPressedChange={tv.setColumns}
            aria-label={t('sideBySide')}
          >
            <Columns2 aria-hidden />
            {t('sideBySide')}
          </Toggle>
        ) : null}
      </div>
      {translated ? (
        <p className="text-muted-foreground text-xs">
          {t('machine', { provider: providerName(providers[translated.view] ?? null) })}
        </p>
      ) : null}
    </div>
  );
}
