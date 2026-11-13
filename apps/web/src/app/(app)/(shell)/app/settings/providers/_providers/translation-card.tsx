'use client';

import type { Providers, TranslationRuleInput } from '@askcalls/client-core/userdata';
import { MAX_TRANSLATIONS_PER_CALL, oneWayDirections } from '@askcalls/domain';
import { DataFlowNote, type DataFlowRoute } from '@askcalls/ui/components/DataFlowNote';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { HealthBadge } from '@askcalls/ui/components/HealthBadge';
import { ProviderCard } from '@askcalls/ui/components/ProviderCard';
import { UsageMeter } from '@askcalls/ui/components/UsageMeter';
import { Button } from '@askcalls/ui/primitives/button';
import { ArrowRight, Languages, Plus, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { localName, nativeName } from '../../../../../../../client/i18n/language-names';
import { useUnlocked } from '../../../../../../../client/session/session';
import { intlLocale } from '../../../../../../../i18n/locales';
import { ReindexJob } from '../../../_calls/reindex-job';
import { LanguagePicker } from './language-picker';
import { providerInfo, providerName } from './registry';
import { useSaveProviders } from './save';

type Rule = TranslationRuleInput;

/** "Hebrew, English and Russian" in the UI language. */
function useNames() {
  const locale = useLocale();
  const t = useTranslations('settings.prov.rules');
  const list = new Intl.ListFormat(intlLocale(locale), { type: 'conjunction' });
  const one = (code: string) => (code === 'any' ? t('otherLanguages') : localName(code, locale));
  return { one, many: (codes: readonly string[]) => list.format(codes.map(one)) };
}

/**
 * Translation by the user's rules: calls in a source language are also stored in each target
 * language, through the provider chosen for "Ask about a call" (managed or own key). No rules:
 * off. The card states the data flow and exactly what keyword search will match, because
 * translation runs at upload without a per-call prompt.
 */
export function TranslationCard({
  value,
  onSaved,
}: {
  value: Providers;
  onSaved: (doc: Providers) => void;
}) {
  const t = useTranslations('settings.prov');
  const tr = useTranslations('settings.prov.rules');
  const ts = useTranslations('settings');
  const td = useTranslations('dataFlow.nodes');
  const { me } = useUnlocked();
  const locale = intlLocale(useLocale());
  const names = useNames();
  const save = useSaveProviders();
  const [rules, setRules] = useState<Rule[]>(value.translation.rules);
  const [failed, setFailed] = useState(false);
  const llm = value.llm;
  const available =
    llm.mode === 'own' || (llm.mode === 'managed' && me.features.translation.enabled);
  const on = available && rules.length > 0;

  const provider =
    llm.mode === 'own'
      ? providerName(llm.key.provider)
      : providerName(me.features.llm.provider ?? null);
  const route: DataFlowRoute = !on
    ? 'off'
    : llm.mode === 'own'
      ? providerInfo('llm', llm.key.provider)?.browserDirect === false
        ? 'passthrough'
        : 'direct'
      : 'managed';
  const flow = !on ? 'trOff' : llm.mode === 'own' ? 'trOwn' : 'trManaged';

  const commit = async (next: Rule[]) => {
    const before = rules;
    setRules(next);
    setFailed(false);
    try {
      const r = await save((p) => ({ ...p, translation: { rules: next } }));
      if (!r.reloading) onSaved(r.doc);
    } catch {
      setRules(before);
      setFailed(true);
    }
  };
  const update = (i: number, rule: Rule | null) =>
    void commit(
      rule === null ? rules.filter((_, k) => k !== i) : rules.map((r, k) => (k === i ? rule : r)),
    );
  const usedFrom = rules.map((r) => r.from);
  const firstFree = ['he', 'en', 'ar', 'ru', 'any'].find((c) => !usedFrom.includes(c));

  const status = !available ? 'setup' : on ? 'working' : 'off';
  return (
    <ProviderCard
      capability="translation"
      title={t('tr')}
      health={
        <HealthBadge
          status={status === 'working' ? 'healthy' : status === 'setup' ? 'degraded' : 'unknown'}
          label={t(`status.${status}`)}
        />
      }
    >
      {available ? (
        <>
          <ol aria-label={tr('label')} className="m-0 flex list-none flex-col gap-2 p-0">
            {rules.map((rule, i) => (
              <li
                key={rule.from}
                data-rule={`${rule.from}:${rule.to.join(',')}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
              >
                <LanguagePicker
                  any
                  value={rule.from}
                  exclude={usedFrom.filter((f) => f !== rule.from)}
                  label={tr('from')}
                  onPick={(from) =>
                    update(i, { from, to: rule.to.filter((l) => l !== from).slice() })
                  }
                  trigger={
                    rule.from === 'any' ? (
                      tr('any')
                    ) : (
                      <bdi lang={rule.from}>{nativeName(rule.from)}</bdi>
                    )
                  }
                />
                <ArrowRight className="icon-directional size-4 text-muted-foreground" aria-hidden />
                {rule.to.map((code) => (
                  <span
                    key={code}
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-muted ps-2.5 pe-1 text-sm"
                  >
                    <bdi lang={code}>{nativeName(code)}</bdi>
                    <button
                      type="button"
                      aria-label={tr('removeTarget', { language: names.one(code) })}
                      disabled={rule.to.length === 1}
                      onClick={() => update(i, { ...rule, to: rule.to.filter((l) => l !== code) })}
                      className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </span>
                ))}
                {rule.to.length < MAX_TRANSLATIONS_PER_CALL ? (
                  <LanguagePicker
                    value={null}
                    exclude={[...rule.to, rule.from]}
                    label={tr('addTarget')}
                    onPick={(code) => update(i, { ...rule, to: [...rule.to, code] })}
                    trigger={
                      <>
                        <Plus className="size-3.5" aria-hidden />
                        {tr('addTarget')}
                      </>
                    }
                  />
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ms-auto"
                  aria-label={tr('remove', { language: names.one(rule.from) })}
                  onClick={() => update(i, null)}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ol>
          {firstFree ? (
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void commit([
                    ...rules,
                    { from: firstFree, to: [firstFree === 'en' ? 'he' : 'en'] },
                  ])
                }
              >
                <Plus className="size-4" aria-hidden />
                {tr('add')}
              </Button>
            </div>
          ) : null}
          <div data-slot="search-coverage" className="flex flex-col gap-1 text-sm">
            {rules.length === 0 ? <p>{tr('none')}</p> : null}
            {rules.map((r) => (
              <p key={r.from}>
                {r.from === 'any'
                  ? tr('coverageAny', { to: names.many(r.to) })
                  : tr('coverage', { from: names.one(r.from), to: names.many(r.to) })}
              </p>
            ))}
            {oneWayDirections(rules).map(([from, to]) => (
              <p key={`${from}-${to}`} className="text-muted-foreground">
                {tr('oneWay', { from: names.one(from), to: names.one(to) })}
              </p>
            ))}
          </div>
          <DataFlowNote
            route={route}
            nodes={{ device: td('device'), server: td('server'), provider }}
          >
            {t(`flow.${flow}`, { provider })}
          </DataFlowNote>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t('trNeedsLlm')}</p>
      )}
      {on && llm.mode === 'managed' ? (
        <UsageMeter
          label={t('usageTr')}
          used={me.usage.translationCharsThisMonth}
          limit={me.limits.translationCharsPerMonth}
          unit={t('chars')}
          locale={locale}
        />
      ) : null}
      {failed ? <ErrorState scope="inline" title={ts('saveFailed')} /> : null}
      {available ? (
        <ReindexJob
          key={JSON.stringify(value.translation.rules)}
          mode="translate"
          ns="settings.prov.backfill"
          icon={Languages}
        />
      ) : null}
    </ProviderCard>
  );
}
