'use client';

import { ApiError } from '@askcalls/api-contract';
import type { ResponseFor } from '@askcalls/api-contract/client';
import { getAccount, updateAccountLimits } from '@askcalls/api-contract/routes/admin';
import { LIMIT_FIELDS, type LimitField } from '@askcalls/domain';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { LimitOverrideField } from '@askcalls/ui/components/LimitOverrideField';
import { SettingsSection } from '@askcalls/ui/components/SettingsSection';
import { UsageMeter } from '@askcalls/ui/components/UsageMeter';
import { formatDate } from '@askcalls/ui/lib/dates';
import { Badge } from '@askcalls/ui/primitives/badge';
import { Button } from '@askcalls/ui/primitives/button';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useState } from 'react';
import { useUnlocked } from '../../../../../../client/session/session';
import { intlLocale } from '../../../../../../i18n/locales';
import { Screen } from '../../../_shell/screen';
import { AsyncView, PanelSkeleton, useAsync } from '../../../_shell/states';
import { fromField, GB, LIMIT_UNITS, toField } from '../_accounts/units';

type Account = ResponseFor<typeof getAccount>;
type Draft = Record<LimitField, string>;

const draftOf = (a: Account): Draft =>
  Object.fromEntries(LIMIT_FIELDS.map((f) => [f, toField(f, a.overrides[f])])) as Draft;

/** A4 Account: one account's usage against its limits, and the limits set for it. */
export default function AccountPage() {
  const t = useTranslations('admin.accounts');
  const { id } = useParams<{ id: string }>();
  const { client } = useUnlocked();
  const loaded = useAsync(() => client.api.request(getAccount, { params: { id } }), [client, id]);
  const [account, setAccount] = useState<Account | null>(null);
  useEffect(() => {
    if (loaded.data) setAccount(loaded.data);
  }, [loaded.data]);
  const notFound =
    loaded.status === 'error' && loaded.error instanceof ApiError && loaded.error.status === 404;

  return (
    <Screen
      title={account?.email ?? t('title')}
      back={{ href: '/admin/accounts', label: t('title') }}
      width="form"
    >
      {notFound ? (
        <ErrorState scope="panel" title={t('notFound')} />
      ) : (
        <AsyncView
          state={loaded}
          loading={<PanelSkeleton lines={8} />}
          error={{ title: t('loadFailed') }}
        >
          {() => (account ? <Detail account={account} onSaved={setAccount} /> : null)}
        </AsyncView>
      )}
    </Screen>
  );
}

function Detail({ account, onSaved }: { account: Account; onSaved: (a: Account) => void }) {
  const t = useTranslations('admin.accounts');
  const locale = intlLocale(useLocale());
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const { client } = useUnlocked();
  const [draft, setDraft] = useState<Draft>(() => draftOf(account));
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'failed'>('idle');
  const saved = draftOf(account);
  const dirty = LIMIT_FIELDS.some((f) => draft[f] !== saved[f]);
  const parsed = LIMIT_FIELDS.map((f) => [f, fromField(f, draft[f])] as const);
  const invalid = new Set(parsed.filter(([, v]) => v === undefined).map(([f]) => f));
  const { limits, usage } = account;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!dirty || invalid.size) return;
    setState('busy');
    const patch = Object.fromEntries(
      parsed.filter(([f]) => draft[f] !== saved[f]).map(([f, v]) => [f, v ?? null]),
    );
    try {
      const next = await client.api.request(updateAccountLimits, {
        params: { id: account.id },
        body: { limits: patch },
      });
      onSaved(next);
      setDraft(draftOf(next));
      setState('saved');
    } catch {
      setState('failed');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">
          {t('joined', {
            plan: t(`plan.${account.plan}`),
            date: formatDate(account.createdAt, locale),
          })}
        </span>
        {account.role === 'admin' ? <Badge variant="accent">{t('admin')}</Badge> : null}
        {account.name ? (
          <bdi dir="auto" className="text-muted-foreground">
            {account.name}
          </bdi>
        ) : null}
      </div>

      <SettingsSection title={t('usage')}>
        <div className="flex flex-col gap-4 py-3">
          <UsageMeter
            label={t('field.maxCalls')}
            used={usage.calls}
            limit={limits.maxCalls}
            unit={t('unit.calls')}
            locale={locale}
          />
          <UsageMeter
            label={t('field.recordingBytes')}
            used={Math.round((usage.recordingBytes / GB) * 100) / 100}
            limit={Math.round((limits.recordingBytes / GB) * 100) / 100}
            unit={t('unit.gb')}
            locale={locale}
          />
          <UsageMeter
            label={t('field.transcriptionMinutesPerMonth')}
            used={Math.ceil(usage.transcriptionSecondsThisMonth / 60)}
            limit={limits.transcriptionMinutesPerMonth}
            unit={t('unit.min')}
            locale={locale}
          />
          <UsageMeter
            label={t('field.asksPerDay')}
            used={usage.asksToday}
            limit={limits.asksPerDay}
            unit={t('unit.asks')}
            locale={locale}
          />
          <UsageMeter
            label={t('field.translationCharsPerMonth')}
            used={usage.translationCharsThisMonth}
            limit={limits.translationCharsPerMonth}
            unit={t('unit.chars')}
            locale={locale}
          />
          <UsageMeter
            label={t('field.maxApiTokens')}
            used={usage.apiTokens}
            limit={limits.maxApiTokens}
            unit={t('unit.tokens')}
            locale={locale}
          />
        </div>
      </SettingsSection>

      <form onSubmit={submit} noValidate>
        <SettingsSection title={t('limits')}>
          <div className="flex flex-col divide-y divide-border">
            {LIMIT_FIELDS.map((f) => {
              const { unit, scale } = LIMIT_UNITS[f];
              const instance = n.format(account.instanceLimits[f] / scale);
              return (
                <LimitOverrideField
                  key={f}
                  label={t(`field.${f}`)}
                  unit={t(`unit.${unit}`)}
                  value={draft[f]}
                  onChange={(v) => {
                    setDraft((d) => ({ ...d, [f]: v }));
                    setState('idle');
                  }}
                  instance={instance}
                  instanceLabel={t('instanceLimit', { value: `${instance} ${t(`unit.${unit}`)}` })}
                  invalid={invalid.has(f)}
                  disabled={state === 'busy'}
                  labels={{ clear: t('clear') }}
                />
              );
            })}
          </div>
          <div className="flex flex-col gap-3 border-border border-t py-4">
            {invalid.size ? <ErrorState scope="inline" title={t('invalid')} /> : null}
            {state === 'failed' ? <ErrorState scope="inline" title={t('saveFailed')} /> : null}
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                loading={state === 'busy'}
                disabled={!dirty || invalid.size > 0}
              >
                {t('save')}
              </Button>
              {dirty ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={state === 'busy'}
                  onClick={() => setDraft(saved)}
                >
                  {t('discard')}
                </Button>
              ) : null}
              {state === 'saved' && !dirty ? (
                <span role="status" className="text-muted-foreground text-sm">
                  {t('saved')}
                </span>
              ) : null}
            </div>
          </div>
        </SettingsSection>
      </form>
    </div>
  );
}
