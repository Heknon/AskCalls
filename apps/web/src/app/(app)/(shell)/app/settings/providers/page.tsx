'use client';

import type { Providers, Settings } from '@askcalls/client-core/userdata';
import { UsageMeter } from '@askcalls/ui/components/UsageMeter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@askcalls/ui/primitives/select';
import { useLocale, useTranslations } from 'next-intl';
import { lazy, Suspense, useId, useState } from 'react';
import { useUnlocked } from '../../../../../../client/session/session';
import { intlLocale } from '../../../../../../i18n/locales';
import { AsyncView, useAsync } from '../../../_shell/states';
import { SectionScreen } from '../_settings/section-screen';
import { BucketCard } from './_providers/bucket-card';
import { Field, KeyCard } from './_providers/key-card';

/** The rules editor and its re-index job load after the page: only this card needs them. */
const TranslationCard = lazy(() =>
  import('./_providers/translation-card').then((m) => ({ default: m.TranslationCard })),
);

/** Transcription language hints offered; any provider takes these BCP-47 codes. */
const LANGUAGES = ['he', 'en', 'ar', 'ru', 'es', 'fr', 'de', 'it', 'pt', 'uk', 'am'] as const;

function LanguageDefault({ settings }: { settings: Settings }) {
  const t = useTranslations('settings.prov');
  const ts = useTranslations('settings');
  const { ctx } = useUnlocked();
  const locale = intlLocale(useLocale());
  const id = useId();
  const [value, setValue] = useState(settings.language);
  const [failed, setFailed] = useState(false);
  const names = new Intl.DisplayNames([locale], { type: 'language' });
  const options =
    LANGUAGES.includes(value as 'he') || value === 'auto' ? LANGUAGES : [...LANGUAGES, value];
  return (
    <Field id={id} label={t('language')} error={failed ? ts('saveFailed') : undefined}>
      <Select
        value={value}
        onValueChange={async (v) => {
          const before = value;
          setValue(v);
          setFailed(false);
          try {
            await ctx.userData.update('settings', (s) => ({ ...s, language: v }));
          } catch {
            setValue(before);
            setFailed(true);
          }
        }}
      >
        <SelectTrigger id={id} className="md:w-[calc(50%-0.5rem)]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{t('autoLang')}</SelectItem>
          {options.map((l) => (
            <SelectItem key={l} value={l}>
              {names.of(l) ?? l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** S5 Providers (spec 11.2a): one card per capability. */
export default function ProvidersSettingsPage() {
  const t = useTranslations('settings.prov');
  const { ctx, me } = useUnlocked();
  const locale = intlLocale(useLocale());
  const docs = useAsync(
    () => Promise.all([ctx.userData.get('providers'), ctx.userData.get('settings')]),
    [ctx],
  );
  const [doc, setDoc] = useState<Providers | null>(null);
  const { transcription, llm } = me.features;

  return (
    <SectionScreen section="providers" description={t('subtitle')}>
      <AsyncView state={docs}>
        {([loaded, settings]) => {
          const p = doc ?? loaded;
          return (
            <div className="flex flex-col gap-6">
              <KeyCard
                cap="transcription"
                value={p.transcription}
                managed={
                  transcription.enabled && transcription.provider
                    ? { provider: transcription.provider, model: null }
                    : null
                }
                usage={
                  <UsageMeter
                    label={t('usageTx')}
                    used={Math.round(me.usage.transcriptionSecondsThisMonth / 60)}
                    limit={me.limits.transcriptionMinutesPerMonth}
                    unit={t('min')}
                    locale={locale}
                  />
                }
                extra={<LanguageDefault settings={settings} />}
                onSaved={setDoc}
              />
              <KeyCard
                cap="llm"
                value={p.llm}
                managed={
                  llm.enabled && llm.provider ? { provider: llm.provider, model: llm.model } : null
                }
                usage={
                  <UsageMeter
                    label={t('usageAsk')}
                    used={me.usage.asksToday}
                    limit={me.limits.asksPerDay}
                    unit={t('asks')}
                    locale={locale}
                  />
                }
                onSaved={setDoc}
              />
              <Suspense fallback={null}>
                <TranslationCard key={p.llm.mode} value={p} onSaved={setDoc} />
              </Suspense>
              <BucketCard value={p.recordings} onSaved={setDoc} />
            </div>
          );
        }}
      </AsyncView>
    </SectionScreen>
  );
}
