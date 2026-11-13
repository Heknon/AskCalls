'use client';

import { ApiError } from '@askcalls/api-contract';
import { promoteToAdmin } from '@askcalls/api-contract/routes/admin';
import { DEFAULT_LIMITS } from '@askcalls/domain';
import { CopyableCode } from '@askcalls/ui/components/CopyableCode';
import { EnvLockedField } from '@askcalls/ui/components/EnvLockedField';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { HealthBadge } from '@askcalls/ui/components/HealthBadge';
import { ProviderCard } from '@askcalls/ui/components/ProviderCard';
import { SettingSwitch } from '@askcalls/ui/components/SettingSwitch';
import { Button } from '@askcalls/ui/primitives/button';
import { Input } from '@askcalls/ui/primitives/input';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import {
  CardActions,
  Field,
  SecretSetting,
  SelectSetting,
  TextSetting,
  useCard,
  useInstance,
  ValueRow,
  type View,
} from './form';

type Health = View['health']['database'] | null;

function Badge({ health }: { health: Health }) {
  const t = useTranslations('admin.health');
  if (!health) return <HealthBadge status="unknown" label={t('off')} />;
  return (
    <HealthBadge
      status={health.status}
      label={t(health.status)}
      {...(health.latencyMs !== null &&
        health.status !== 'down' && { latencyMs: health.latencyMs })}
    />
  );
}

function useProviders() {
  const t = useTranslations('admin.provider');
  const { view } = useInstance();
  const testing = view.environment !== 'production';
  return (ids: string[]) =>
    ids
      .filter((id) => id !== 'mock' || testing)
      .map((id) => ({ value: id, label: t(id as 'none') }));
}

export function DatabaseCard() {
  const t = useTranslations('admin');
  const card = useCard('database');
  const { view } = card;
  const driver = String(card.get('db.driver'));
  const changeable = view.usage.databaseEmpty && !card.locked('db.driver');
  const display = String(card.get('db.urlDisplay') ?? '');
  return (
    <ProviderCard
      capability="database"
      context="instance"
      title={t('cards.database')}
      health={<Badge health={view.health.database} />}
    >
      {changeable ? (
        <SelectSetting
          card={card}
          path="db.driver"
          label={t('field.driver')}
          options={['postgres', 'pglite'].map((v) => ({
            value: v,
            label: t(`adapter.${v}` as 'adapter.postgres'),
          }))}
        />
      ) : (
        <ValueRow label={t('field.driver')} value={t(`adapter.${driver}` as 'adapter.postgres')} />
      )}
      {driver === 'postgres' ? (
        changeable || card.locked('db.url') ? (
          <SecretSetting
            card={card}
            path="db.url"
            label={t('field.connection')}
            display={display}
          />
        ) : (
          <EnvLockedField label={t('field.connection')} value={display} caption={t('dbLocked')} />
        )
      ) : driver === 'pglite' ? (
        <TextSetting card={card} path="db.pgliteDir" label={t('field.folder')} />
      ) : null}
      {view.usage.databaseEmpty ? null : (
        <p className="text-muted-foreground text-sm">{t('dbLocked')}</p>
      )}
      <CardActions
        card={card}
        note={<p className="text-muted-foreground text-sm">{t('restart')}</p>}
      />
    </ProviderCard>
  );
}

export function BlobCard() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const card = useCard('blob');
  const { view } = card;
  const driver = String(card.get('blob.driver'));
  const options = ['s3', 'fs', ...(driver === 'memory' ? ['memory'] : [])].map((v) => ({
    value: v,
    label: t(`adapter.${v}` as 'adapter.s3'),
  }));
  const cors = card.test.result?.cors;
  return (
    <ProviderCard
      capability="storage"
      context="instance"
      title={t('cards.blob')}
      health={<Badge health={view.health.blob} />}
    >
      <SelectSetting card={card} path="blob.driver" label={t('field.adapter')} options={options} />
      {driver === 's3' ? (
        <>
          <TextSetting card={card} path="blob.s3.endpoint" label={t('field.endpoint')} />
          <div className="grid gap-4 md:grid-cols-2">
            <TextSetting card={card} path="blob.s3.bucket" label={t('field.bucket')} />
            <TextSetting card={card} path="blob.s3.region" label={t('field.region')} />
          </div>
          <TextSetting card={card} path="blob.s3.accessKeyId" label={t('field.accessKeyId')} />
          <SecretSetting card={card} path="blob.s3.secretAccessKey" label={t('field.secretKey')} />
        </>
      ) : driver === 'fs' ? (
        <TextSetting card={card} path="blob.fsDir" label={t('field.folder')} />
      ) : null}
      {cors && cors.status !== 'ok' && cors.fixJson ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">{t('cors.missing')}</p>
          <CopyableCode
            language="json"
            code={cors.fixJson}
            labels={{ copy: tc('copy'), copied: tc('copied') }}
          />
        </div>
      ) : cors?.status === 'ok' ? (
        <p className="text-muted-foreground text-sm">{t('cors.ok')}</p>
      ) : null}
      <CardActions card={card} />
    </ProviderCard>
  );
}

const OAUTH = ['google', 'github'] as const;

export function SignInCard() {
  const t = useTranslations('admin');
  const card = useCard();
  const providers = (card.get('auth.providers') as string[] | undefined) ?? [];
  const lockedProviders = card.locked('auth.providers');
  const toggle = (id: string, on: boolean) =>
    card.set('auth.providers', on ? [...providers, id] : providers.filter((p) => p !== id));
  return (
    <ProviderCard capability="sign-in" context="instance" title={t('cards.signIn')}>
      {lockedProviders ? (
        <EnvLockedField
          label={t('cards.signIn')}
          value={providers.map((p) => t(`signIn.${p}` as 'signIn.google')).join(', ') || '—'}
          caption={t('envLocked')}
        />
      ) : null}
      {OAUTH.map((id) => (
        <div key={id} className="flex flex-col gap-3">
          {lockedProviders ? null : (
            <SettingSwitch
              label={t(`signIn.${id}`)}
              checked={providers.includes(id)}
              onChange={(on) => toggle(id, on)}
            />
          )}
          {providers.includes(id) ? (
            <div className="flex flex-col gap-4">
              <TextSetting card={card} path={`auth.${id}.id`} label={t('field.clientId')} />
              <SecretSetting
                card={card}
                path={`auth.${id}.secret`}
                label={t('field.clientSecret')}
              />
            </div>
          ) : null}
        </div>
      ))}
      <div className="flex flex-col gap-3">
        {lockedProviders ? null : (
          <SettingSwitch
            label={t('signIn.email')}
            checked={providers.includes('email')}
            onChange={(on) => toggle('email', on)}
          />
        )}
        {providers.includes('email') ? (
          <div className="flex flex-col gap-4">
            <SecretSetting card={card} path="auth.email.server" label={t('field.smtp')} />
            <TextSetting
              card={card}
              path="auth.email.from"
              label={t('field.from')}
              technical={false}
            />
          </div>
        ) : null}
      </div>
      {card.locked('auth.localAccounts') ? (
        <EnvLockedField
          label={t('signIn.local')}
          value={card.get('auth.localAccounts') ? t('value.on') : t('value.off')}
          caption={t('envLocked')}
          technical={false}
        />
      ) : (
        <SettingSwitch
          label={t('signIn.local')}
          hint={t('signIn.localHint')}
          checked={card.get('auth.localAccounts') === true}
          onChange={(on) => card.set('auth.localAccounts', on)}
        />
      )}
      <p className="text-muted-foreground text-sm">{t('signIn.passkeyNote')}</p>
      <CardActions card={card} />
    </ProviderCard>
  );
}

const TRANSCRIPTION = [
  'elevenlabs',
  'openai',
  'deepgram',
  'soniox',
  'openai-compatible',
  'mock',
  'none',
];
const CLOUD_TX = new Set(['elevenlabs', 'openai', 'deepgram', 'soniox']);

export function TranscriptionCard() {
  const t = useTranslations('admin');
  const providers = useProviders();
  const card = useCard('transcription');
  const provider = String(card.get('transcription.provider'));
  return (
    <ProviderCard
      capability="transcription"
      context="instance"
      title={t('cards.transcription')}
      health={<Badge health={card.view.health.transcription} />}
    >
      <SelectSetting
        card={card}
        path="transcription.provider"
        label={t('field.provider')}
        options={providers(TRANSCRIPTION)}
      />
      {CLOUD_TX.has(provider) ? (
        <SecretSetting
          card={card}
          path={`transcription.keys.${provider}`}
          label={t('field.apiKey')}
        />
      ) : provider === 'openai-compatible' ? (
        <TextSetting
          card={card}
          path="transcription.baseUrl"
          label={t('field.baseUrl')}
          placeholder="http://whisper:8000/v1"
        />
      ) : null}
      <CardActions card={card} />
    </ProviderCard>
  );
}

const LLM = ['anthropic', 'openai', 'google', 'openai-compatible', 'mock', 'none'];

export function LlmCard() {
  const t = useTranslations('admin');
  const providers = useProviders();
  const card = useCard('llm');
  const provider = String(card.get('llm.provider'));
  const remote = provider !== 'none' && provider !== 'mock';
  return (
    <ProviderCard
      capability="ask"
      context="instance"
      title={t('cards.llm')}
      health={<Badge health={card.view.health.llm} />}
    >
      <SelectSetting
        card={card}
        path="llm.provider"
        label={t('field.provider')}
        options={providers(LLM)}
      />
      {remote ? (
        <>
          {provider === 'openai-compatible' ? (
            <TextSetting
              card={card}
              path="llm.baseUrl"
              label={t('field.baseUrl')}
              placeholder="http://ollama:11434/v1"
            />
          ) : null}
          <TextSetting card={card} path="llm.model" label={t('field.model')} />
          <SecretSetting card={card} path="llm.apiKey" label={t('field.apiKey')} />
        </>
      ) : null}
      <CardActions card={card} />
    </ProviderCard>
  );
}

export function EmbeddingsCard() {
  const t = useTranslations('admin');
  const card = useCard();
  return (
    <ProviderCard capability="provider" context="instance" title={t('cards.embeddings')}>
      <TextSetting
        card={card}
        path="embeddingModelUrl"
        label={t('field.modelUrl')}
        placeholder={t('value.thisInstance')}
        hint={t('embeddings.hint')}
      />
      <CardActions card={card} />
    </ProviderCard>
  );
}

export function TelemetryCard() {
  const t = useTranslations('admin');
  const card = useCard();
  const backends = (card.get('telemetry.backends') as string[] | undefined) ?? [];
  return (
    <ProviderCard capability="provider" context="instance" title={t('cards.telemetry')}>
      {card.locked('telemetry.backends') ? (
        <EnvLockedField
          label={t('field.backends')}
          value={backends.join(', ') || t('value.off')}
          caption={t('envLocked')}
          technical={false}
        />
      ) : backends.length ? (
        <>
          <ValueRow label={t('field.backends')} value={backends.join(', ')} technical />
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void card.save({ 'telemetry.backends': [] })}
            >
              {t('telemetry.turnOff')}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground">{t('telemetry.off')}</p>
      )}
      <CardActions card={card} />
    </ProviderCard>
  );
}

export function LimitsCard() {
  const t = useTranslations('admin');
  const card = useCard();
  return (
    <ProviderCard capability="provider" context="instance" title={t('cards.limits')}>
      <TextSetting card={card} path="limits.freeTierMaxCalls" label={t('field.maxCalls')} numeric />
      <ValueRow
        label={t('field.transcriptionMinutes')}
        value={t('value.minutes', { n: DEFAULT_LIMITS.transcriptionMinutesPerMonth })}
      />
      <ValueRow label={t('field.asksPerDay')} value={DEFAULT_LIMITS.asksPerDay} />
      <ValueRow
        label={t('field.recordings')}
        value={t('value.gb', { n: Math.round(DEFAULT_LIMITS.recordingBytes / 1024 ** 3) })}
      />
      <ValueRow label={t('field.tokens')} value={DEFAULT_LIMITS.maxApiTokens} />
      <CardActions card={card} />
    </ProviderCard>
  );
}

export function UsersCard() {
  const t = useTranslations('admin');
  const { view, api } = useInstance();
  const id = useId();
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'already' | 'notFound' | 'error'>(
    'idle',
  );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setState('busy');
    try {
      const r = await api.request(promoteToAdmin, { body: { email } });
      setState(r.alreadyAdmin ? 'already' : 'done');
      if (!r.alreadyAdmin) setEmail('');
    } catch (err) {
      setState(err instanceof ApiError && err.status === 404 ? 'notFound' : 'error');
    }
  };
  return (
    <ProviderCard capability="sign-in" context="instance" title={t('cards.users')}>
      <p className="text-muted-foreground">{t('users.count', { n: view.usage.users })}</p>
      {view.hosted ? null : (
        <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
          <Field label={t('users.email')} htmlFor={id}>
            <div className="flex gap-2">
              <Input
                id={id}
                type="email"
                dir="ltr"
                autoComplete="off"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setState('idle');
                }}
              />
              <Button type="submit" variant="outline" loading={state === 'busy'}>
                {t('users.promote')}
              </Button>
            </div>
          </Field>
          {state === 'done' ? (
            <p role="status" className="text-sm text-success">
              {t('users.promoted')}
            </p>
          ) : state === 'already' ? (
            <p role="status" className="text-muted-foreground text-sm">
              {t('users.already')}
            </p>
          ) : state === 'notFound' ? (
            <ErrorState scope="inline" title={t('users.notFound')} />
          ) : null}
        </form>
      )}
    </ProviderCard>
  );
}
