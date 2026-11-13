'use client';

import type { Providers } from '@askcalls/client-core/userdata';
import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { DataFlowNote, type DataFlowRoute } from '@askcalls/ui/components/DataFlowNote';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { HealthBadge } from '@askcalls/ui/components/HealthBadge';
import { MaskedSecret } from '@askcalls/ui/components/MaskedSecret';
import { ProviderCard, type ProviderChoice } from '@askcalls/ui/components/ProviderCard';
import { TestConnectionResult } from '@askcalls/ui/components/TestConnectionResult';
import { Button } from '@askcalls/ui/primitives/button';
import { Input } from '@askcalls/ui/primitives/input';
import { Label } from '@askcalls/ui/primitives/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@askcalls/ui/primitives/select';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useId, useState } from 'react';
import { normalizeOrigin } from '../../../../../../../client/direct-origins';
import { useUnlocked } from '../../../../../../../client/session/session';
import { useSeconds } from '../../_settings/format';
import { type OwnKey, type TestOutcome, testAsk, testTranscription } from './connection-test';
import {
  type KeyCapability,
  modelName,
  OWN_KEY_PROVIDERS,
  providerInfo,
  providerName,
} from './registry';
import { maskParts, useSaveProviders } from './save';

type Capability = Providers['transcription'];

/** A labelled field: label above, control, optional error. */
export function Field({
  label,
  error,
  children,
  id,
}: {
  label: string;
  error?: string | undefined;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function testDetail(
  t: ReturnType<typeof useTranslations<'settings.prov'>>,
  outcome: TestOutcome,
  ok: string,
  host: string,
  provider: string,
): string {
  if (outcome.ok) return ok;
  switch (outcome.reason) {
    case 'key':
      return t('test401');
    case 'cors':
      return t('testCors');
    case 'unreachable':
      return t('testUnreachable', { host });
    case 'notFound':
      return t('testNotFound');
    case 'quota':
      return t('testQuota');
    default:
      return t('testFailed', { provider, status: String(outcome.status ?? '') });
  }
}

const hostOf = (key: OwnKey | null, fallback: string) => {
  if (key?.baseUrl) {
    try {
      return new URL(key.baseUrl).host;
    } catch {
      return key.baseUrl;
    }
  }
  return fallback;
};

const PROVIDER_HOSTS: Record<string, string> = {
  elevenlabs: 'api.elevenlabs.io',
  openai: 'api.openai.com',
  deepgram: 'api.deepgram.com',
  soniox: 'api.soniox.com',
  anthropic: 'api.anthropic.com',
  google: 'generativelanguage.googleapis.com',
};

interface Draft {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}

const draftOf = (cap: KeyCapability, c: Capability): Draft => {
  const first = OWN_KEY_PROVIDERS[cap][0]!;
  if (c.mode !== 'own') {
    return { provider: first.id, model: first.models[0]?.id ?? '', baseUrl: '', apiKey: '' };
  }
  const info = providerInfo(cap, c.key.provider);
  return {
    provider: c.key.provider,
    model: c.key.model ?? info?.models[0]?.id ?? '',
    baseUrl: c.key.baseUrl ?? '',
    apiKey: '',
  };
};

/**
 * Transcription and Ask about a call (spec 11.2a): managed, own key (from the adapter
 * registry, called straight from the browser) or off.
 */
export function KeyCard({
  cap,
  value,
  managed,
  usage,
  extra,
  onSaved,
}: {
  cap: KeyCapability;
  value: Capability;
  /** The instance's provider for this capability; null when it has none. */
  managed: { provider: string; model: string | null } | null;
  usage: ReactNode;
  /** Fields every mode keeps (the default language). */
  extra?: ReactNode;
  onSaved: (doc: Providers) => void;
}) {
  const t = useTranslations('settings.prov');
  const ts = useTranslations('settings');
  const tc = useTranslations('common');
  const td = useTranslations('dataFlow.nodes');
  const { client } = useUnlocked();
  const save = useSaveProviders();
  const seconds = useSeconds();
  const id = useId();
  const [choice, setChoice] = useState<ProviderChoice>(value.mode);
  const [draft, setDraft] = useState<Draft>(() => draftOf(cap, value));
  const [replacing, setReplacing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<'key' | 'baseUrl' | 'model' | 'failed' | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [test, setTest] = useState<
    { state: 'idle' | 'testing' } | { state: 'done'; outcome: TestOutcome }
  >({ state: 'idle' });
  const tx = cap === 'transcription';
  const info = providerInfo(cap, draft.provider);
  const saved = value.mode === 'own' ? value.key : null;
  const savedHere = saved !== null && saved.provider === draft.provider;
  const needsKeyInput = !savedHere || replacing;

  const commit = async (next: Capability) => {
    setSaving(true);
    setError(null);
    try {
      const r = await save((p) => ({ ...p, [cap]: next }));
      if (r.reloading) return;
      onSaved(r.doc);
      setReplacing(false);
      setTest({ state: 'idle' });
      setDraft((d) => ({ ...d, apiKey: '' }));
    } catch {
      setError('failed');
      setChoice(value.mode);
    } finally {
      setSaving(false);
    }
  };

  const pick = (c: ProviderChoice) => {
    setError(null);
    if (c === 'managed') {
      setChoice(c);
      if (value.mode !== 'managed') void commit({ mode: 'managed' });
    } else if (c === 'off') {
      if (tx) setConfirmOff(true);
      else {
        setChoice(c);
        void commit({ mode: 'off' });
      }
    } else {
      setChoice(c);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!info) return;
    const apiKey = needsKeyInput ? draft.apiKey.trim() : saved!.apiKey;
    if (info.keyRequired && !apiKey) return setError('key');
    if (info.baseUrl === 'required' && !normalizeOrigin(draft.baseUrl.trim())) {
      return setError('baseUrl');
    }
    if (info.models.length === 0 && !draft.model.trim()) return setError('model');
    void commit({
      mode: 'own',
      key: {
        provider: info.id,
        // An OpenAI-compatible server without auth still gets a placeholder bearer value.
        apiKey: apiKey || 'none',
        baseUrl: info.baseUrl === 'required' ? draft.baseUrl.trim() : null,
        model: draft.model.trim() || null,
      },
    });
  };

  const runTest = async () => {
    setTest({ state: 'testing' });
    const key = value.mode === 'own' ? value.key : null;
    const outcome = await (tx ? testTranscription(client.api, key) : testAsk(client.api, key));
    setTest({ state: 'done', outcome });
  };

  const activeProvider =
    value.mode === 'own'
      ? providerName(value.key.provider)
      : providerName(managed?.provider ?? null);
  const shownProvider = choice === 'own' ? providerName(draft.provider) : activeProvider;
  const route: DataFlowRoute =
    choice === 'off'
      ? 'off'
      : choice === 'own'
        ? info?.browserDirect
          ? 'direct'
          : 'passthrough'
        : 'managed';
  const flowKey =
    `${tx ? 'tx' : 'ask'}${choice === 'own' ? 'Own' : choice === 'off' ? 'Off' : 'Managed'}` as const;
  const configured =
    value.mode === 'off' ? 'off' : value.mode === 'own' || managed ? 'working' : 'setup';
  const status = choice !== value.mode && choice === 'own' ? 'setup' : configured;
  const testable =
    choice === value.mode && (value.mode === 'own' || (value.mode === 'managed' && managed));
  const okDetail =
    test.state === 'done' && test.outcome.ok
      ? tx
        ? t('testOkTx', { s: seconds(test.outcome.ms) })
        : t('testOkAsk', {
            model:
              modelName(
                providerInfo(
                  'llm',
                  value.mode === 'own' ? value.key.provider : (managed?.provider ?? ''),
                ),
                value.mode === 'own' ? value.key.model : (managed?.model ?? null),
              ) || shownProvider,
            s: seconds(test.outcome.ms),
          })
      : '';
  const dirty =
    choice === 'own' &&
    (value.mode !== 'own' ||
      needsKeyInput ||
      draft.provider !== value.key.provider ||
      (draft.model || null) !== (value.key.model ?? info?.models[0]?.id ?? null) ||
      (draft.baseUrl || null) !== value.key.baseUrl);

  return (
    <ProviderCard
      capability={tx ? 'transcription' : 'ask'}
      title={tx ? t('tx') : t('ask')}
      health={
        <HealthBadge
          status={status === 'working' ? 'healthy' : status === 'setup' ? 'degraded' : 'unknown'}
          label={t(`status.${status}`)}
        />
      }
      choice={{
        value: choice,
        label: t('choiceLabel', { capability: tx ? t('tx') : t('ask') }),
        onChange: pick,
        options: [
          { value: 'managed', label: t('choice.managed'), disabled: !managed || saving },
          { value: 'own', label: t('choice.own'), disabled: saving },
          { value: 'off', label: t('choice.off'), disabled: saving },
        ],
      }}
    >
      {choice === 'managed' && !managed ? (
        <p className="text-muted-foreground text-sm">{t('unavailable')}</p>
      ) : (
        <DataFlowNote
          route={route}
          nodes={{ device: td('device'), server: td('server'), provider: shownProvider }}
        >
          {t(`flow.${flowKey}`, { provider: shownProvider })}
        </DataFlowNote>
      )}
      {choice === 'own' && info && !info.browserDirect ? (
        <p className="text-muted-foreground text-sm">{t('agentOnly')}</p>
      ) : null}

      {choice === 'own' ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field id={`${id}-p`} label={t('provider')}>
              <Select
                value={draft.provider}
                onValueChange={(p) => {
                  const next = providerInfo(cap, p);
                  setError(null);
                  setDraft((d) => ({ ...d, provider: p, model: next?.models[0]?.id ?? '' }));
                }}
              >
                <SelectTrigger id={`${id}-p`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OWN_KEY_PROVIDERS[cap].map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              id={`${id}-m`}
              label={t('model')}
              error={error === 'model' ? t('needsModel') : undefined}
            >
              {info && info.models.length > 0 ? (
                <Select
                  value={draft.model}
                  onValueChange={(m) => setDraft((d) => ({ ...d, model: m }))}
                >
                  <SelectTrigger id={`${id}-m`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {info.models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`${id}-m`}
                  dir="ltr"
                  placeholder={t('modelPlaceholder')}
                  value={draft.model}
                  onChange={(e) => {
                    setError(null);
                    setDraft((d) => ({ ...d, model: e.target.value }));
                  }}
                />
              )}
            </Field>
          </div>
          {info?.baseUrl === 'required' ? (
            <Field
              id={`${id}-u`}
              label={t('baseUrl')}
              error={error === 'baseUrl' ? t('needsBaseUrl') : undefined}
            >
              <Input
                id={`${id}-u`}
                dir="ltr"
                inputMode="url"
                placeholder={t('baseUrlPlaceholder')}
                value={draft.baseUrl}
                onChange={(e) => {
                  setError(null);
                  setDraft((d) => ({ ...d, baseUrl: e.target.value }));
                }}
              />
            </Field>
          ) : null}
          <Field
            id={`${id}-k`}
            label={info?.keyRequired === false ? t('apiKeyOptional') : t('apiKey')}
            error={error === 'key' ? t('needsKey') : undefined}
          >
            {needsKeyInput ? (
              <Input
                id={`${id}-k`}
                type="password"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                value={draft.apiKey}
                onChange={(e) => {
                  setError(null);
                  setDraft((d) => ({ ...d, apiKey: e.target.value }));
                }}
              />
            ) : (
              <MaskedSecret
                {...maskParts(saved!.apiKey)}
                onReplace={() => setReplacing(true)}
                onRemove={() => {
                  setChoice('managed');
                  void commit(managed ? { mode: 'managed' } : { mode: 'off' });
                }}
                labels={{ masked: t('masked'), replace: t('replace'), remove: t('remove') }}
              />
            )}
          </Field>
          {info ? (
            <p className="text-muted-foreground text-sm">{t('billed', { provider: info.name })}</p>
          ) : null}
          {dirty ? (
            <div>
              <Button type="submit" variant="primary" loading={saving}>
                {saving ? ts('saving') : t('save')}
              </Button>
            </div>
          ) : null}
        </form>
      ) : null}

      {choice !== 'off' ? extra : null}
      {choice === 'managed' && managed ? usage : null}
      {error === 'failed' ? <ErrorState scope="inline" title={ts('saveFailed')} /> : null}
      {testable && !dirty ? (
        <TestConnectionResult
          state={test.state === 'done' ? (test.outcome.ok ? 'ok' : 'failed') : test.state}
          detail={
            test.state === 'done'
              ? testDetail(
                  t,
                  test.outcome,
                  okDetail,
                  hostOf(saved, PROVIDER_HOSTS[saved?.provider ?? ''] ?? location.host),
                  activeProvider,
                )
              : undefined
          }
          onTest={runTest}
          labels={{ test: t('test'), testing: t('testing') }}
        />
      ) : null}
      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title={t('offConfirmTitle')}
        description={t('offConfirm')}
        confirmLabel={t('offConfirmAction')}
        cancelLabel={tc('cancel')}
        onConfirm={() => {
          setChoice('off');
          void commit({ mode: 'off' });
        }}
      />
    </ProviderCard>
  );
}
