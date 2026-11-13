'use client';

import { DataFlowNote } from '@askcalls/ui/components/DataFlowNote';
import { useTranslations } from 'next-intl';
import type { TranscriptionFlow, TranslationFlow } from './plan';

/** The provider's name for the data-flow sentence; ids without a name read as the generic one. */
export function useProviderName() {
  const t = useTranslations('upload.provider');
  return (id: string) => (t.has(id as 'managed') ? t(id as 'managed') : id);
}

/** Where audio goes for transcription, named before anything is sent (design-language 2.6). */
export function TranscriptionNote({ flow }: { flow: TranscriptionFlow }) {
  const t = useTranslations('upload');
  const nodes = useTranslations('dataFlow.nodes');
  const name = useProviderName();
  if (flow.route === 'off') return null;
  const provider = name(flow.provider);
  return (
    <DataFlowNote
      route={flow.route}
      nodes={{ device: nodes('device'), server: nodes('server'), provider }}
    >
      {t(`flow.${flow.route}`, { provider })}
    </DataFlowNote>
  );
}

/** Where the transcript goes for translation: every upload is translated without a prompt. */
export function TranslationNote({ flow }: { flow: TranslationFlow }) {
  const t = useTranslations('upload');
  const nodes = useTranslations('dataFlow.nodes');
  const names = useTranslations('upload.providerLlm');
  const provider = flow.provider
    ? names.has(flow.provider as 'managed')
      ? names(flow.provider as 'managed')
      : flow.provider
    : '';
  return (
    <DataFlowNote
      route={flow.route}
      nodes={{ device: nodes('device'), server: nodes('server'), provider }}
    >
      {t(`flowTr.${flow.route}`, { provider })}
    </DataFlowNote>
  );
}
