'use client';

import {
  previousBucket,
  previousDrive,
  switchRecordings,
} from '@askcalls/client-core/recording-stores/choice';
import { activeStoreRef } from '@askcalls/client-core/recording-stores/refs';
import {
  type BucketConfig,
  corsRulesFor,
} from '@askcalls/client-core/recording-stores/s3-compatible';
import { type Providers, randomId } from '@askcalls/client-core/userdata';
import { CopyableCode } from '@askcalls/ui/components/CopyableCode';
import { DataFlowNote } from '@askcalls/ui/components/DataFlowNote';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { HealthBadge } from '@askcalls/ui/components/HealthBadge';
import { MaskedSecret } from '@askcalls/ui/components/MaskedSecret';
import { ProviderCard, type ProviderChoice } from '@askcalls/ui/components/ProviderCard';
import { TestConnectionResult } from '@askcalls/ui/components/TestConnectionResult';
import { Alert } from '@askcalls/ui/primitives/alert';
import { Button } from '@askcalls/ui/primitives/button';
import { Input } from '@askcalls/ui/primitives/input';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, lazy, Suspense, useId, useState } from 'react';
import { normalizeOrigin } from '../../../../../../../client/direct-origins';
import { useUnlocked } from '../../../../../../../client/session/session';
import { type TestOutcome, testBucket } from './connection-test';
import { Field, testDetail } from './key-card';
import { maskParts, useSaveProviders } from './save';

/**
 * The Drive panel (its OAuth popup) and the move section (it scans every call's recording) load
 * after the card, in one chunk.
 */
const DrivePanel = lazy(() =>
  import('./own-store-panels').then((m) => ({ default: m.DrivePanel })),
);
const MoveRecordings = lazy(() =>
  import('./own-store-panels').then((m) => ({ default: m.MoveRecordings })),
);

type Draft = Omit<BucketConfig, 'id'>;
const EMPTY: Draft = { endpoint: '', bucket: '', region: '', accessKeyId: '', secretAccessKey: '' };

/**
 * Recording backups: the instance bucket, the user's own S3-compatible bucket, their Google
 * Drive, or off.
 */
export function BucketCard({
  doc,
  googleDrive,
  onSaved,
}: {
  doc: Providers;
  /** The instance has a Google OAuth client for Drive. */
  googleDrive: boolean;
  onSaved: (doc: Providers) => void;
}) {
  const value = doc.recordings;
  const t = useTranslations('settings.prov');
  const tb = useTranslations('settings.prov.bucket');
  const ts = useTranslations('settings');
  const tc = useTranslations('common');
  const td = useTranslations('dataFlow.nodes');
  const { client } = useUnlocked();
  const save = useSaveProviders();
  const id = useId();
  const saved = value.mode === 'own' ? value.bucket : null;
  const [choice, setChoice] = useState<ProviderChoice>(value.mode);
  const [savedMode, setSavedMode] = useState(value.mode);
  if (savedMode !== value.mode) {
    setSavedMode(value.mode);
    setChoice(value.mode);
  }
  const [draft, setDraft] = useState<Draft>(() =>
    saved ? { ...saved, secretAccessKey: '' } : EMPTY,
  );
  const [replacing, setReplacing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<'incomplete' | 'badEndpoint' | 'failed' | null>(null);
  const [test, setTest] = useState<
    { state: 'idle' | 'testing' } | { state: 'done'; outcome: TestOutcome }
  >({ state: 'idle' });
  const needsSecret = !saved || replacing;

  const commit = async (next: Providers['recordings']) => {
    setSaving(true);
    setError(null);
    try {
      const r = await save((p) => switchRecordings(p, next));
      if (r.reloading) return;
      onSaved(r.doc);
      if (next.mode === 'own') setDraft({ ...next.bucket, secretAccessKey: '' });
      setReplacing(false);
      setTest({ state: 'idle' });
    } catch {
      setError('failed');
      setChoice(value.mode);
    } finally {
      setSaving(false);
    }
  };

  const pick = (c: ProviderChoice) => {
    setChoice(c);
    setError(null);
    if (value.mode === c) return;
    // A store switched away from earlier is picked up again as it was.
    const bucket = previousBucket(doc);
    const drive = previousDrive(doc);
    if (c === 'managed' || c === 'off') void commit({ mode: c });
    else if (c === 'own' && bucket) void commit({ mode: 'own', bucket });
    else if (c === 'drive' && drive) void commit({ mode: 'drive', drive });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const secret = needsSecret ? draft.secretAccessKey.trim() : saved!.secretAccessKey;
    const endpoint = draft.endpoint.trim();
    if (!endpoint || !draft.bucket.trim() || !draft.accessKeyId.trim() || !secret) {
      return setError('incomplete');
    }
    const withScheme = /^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`;
    if (!normalizeOrigin(withScheme)) return setError('badEndpoint');
    void commit({
      mode: 'own',
      bucket: {
        id: saved?.id ?? randomId(),
        endpoint: withScheme,
        bucket: draft.bucket.trim(),
        region: draft.region.trim(),
        accessKeyId: draft.accessKeyId.trim(),
        secretAccessKey: secret,
      },
    });
  };

  const runTest = async () => {
    if (!saved) return;
    setTest({ state: 'testing' });
    setTest({
      state: 'done',
      outcome: await testBucket((b) => client.ownStores.s3.probeBucket(b), saved),
    });
  };

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => {
    setError(null);
    setDraft((d) => ({ ...d, [k]: e.target.value }));
  };

  const dirty =
    choice === 'own' &&
    (!saved ||
      needsSecret ||
      (['endpoint', 'bucket', 'region', 'accessKeyId'] as const).some(
        (k) => draft[k] !== saved[k],
      ));
  const status =
    value.mode === 'off'
      ? 'off'
      : (choice === 'own' && dirty) || (choice === 'drive' && value.mode !== 'drive')
        ? 'setup'
        : 'working';
  const flow = (
    {
      own: 'recOwn',
      drive: 'recDrive',
      off: 'recOff',
      managed: 'recManaged',
      local: 'recManaged',
    } as const
  )[choice];
  const target = activeStoreRef(doc);
  const host = saved ? new URL(saved.endpoint).host : '';

  return (
    <ProviderCard
      capability="recordings"
      title={t('rec')}
      health={
        <HealthBadge
          status={status === 'working' ? 'healthy' : status === 'setup' ? 'degraded' : 'unknown'}
          label={t(`status.${status}`)}
        />
      }
      choice={{
        value: choice,
        label: t('choiceLabel', { capability: t('rec') }),
        onChange: pick,
        options: [
          { value: 'managed', label: t('choice.managed'), disabled: saving },
          { value: 'own', label: t('choice.bucket'), disabled: saving },
          ...(googleDrive || value.mode === 'drive'
            ? [{ value: 'drive' as const, label: t('choice.drive'), disabled: saving }]
            : []),
          { value: 'off', label: t('choice.off'), disabled: saving },
        ],
      }}
    >
      <DataFlowNote
        route={
          choice === 'own' || choice === 'drive' ? 'direct' : choice === 'off' ? 'off' : 'on-device'
        }
        nodes={{
          device: td('device'),
          server: td('server'),
          provider: choice === 'drive' ? t('choice.drive') : tb('provider'),
        }}
      >
        {t(`flow.${flow}`)}
      </DataFlowNote>

      {choice === 'own' ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field
            id={`${id}-e`}
            label={tb('endpoint')}
            error={error === 'badEndpoint' ? tb('badEndpoint') : undefined}
          >
            <Input
              id={`${id}-e`}
              dir="ltr"
              inputMode="url"
              placeholder={tb('endpointPlaceholder')}
              value={draft.endpoint}
              onChange={set('endpoint')}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id={`${id}-b`} label={tb('name')}>
              <Input id={`${id}-b`} dir="ltr" value={draft.bucket} onChange={set('bucket')} />
            </Field>
            <Field id={`${id}-r`} label={tb('region')}>
              <Input
                id={`${id}-r`}
                dir="ltr"
                placeholder={tb('regionPlaceholder')}
                value={draft.region}
                onChange={set('region')}
              />
            </Field>
          </div>
          <Field id={`${id}-a`} label={tb('accessKeyId')}>
            <Input
              id={`${id}-a`}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={draft.accessKeyId}
              onChange={set('accessKeyId')}
            />
          </Field>
          <Field id={`${id}-s`} label={tb('secret')}>
            {needsSecret ? (
              <Input
                id={`${id}-s`}
                type="password"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                value={draft.secretAccessKey}
                onChange={set('secretAccessKey')}
              />
            ) : (
              <MaskedSecret
                {...maskParts(saved!.secretAccessKey)}
                onReplace={() => setReplacing(true)}
                labels={{ masked: tb('maskedSecret'), replace: t('replace'), remove: t('remove') }}
              />
            )}
          </Field>
          {error === 'incomplete' ? (
            <p role="alert" className="text-destructive text-sm">
              {tb('incomplete')}
            </p>
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
      {error === 'failed' ? <ErrorState scope="inline" title={ts('saveFailed')} /> : null}

      {choice === 'own' && saved && !dirty ? (
        <>
          <TestConnectionResult
            state={test.state === 'done' ? (test.outcome.ok ? 'ok' : 'failed') : test.state}
            detail={
              test.state === 'done'
                ? testDetail(
                    t,
                    test.outcome,
                    t('testOkBucket', { bucket: saved.bucket }),
                    host,
                    host,
                  )
                : undefined
            }
            onTest={runTest}
            labels={{ test: t('test'), testing: t('testing') }}
          />
          {test.state === 'done' && !test.outcome.ok && test.outcome.reason === 'cors' ? (
            <div className="flex flex-col gap-2">
              <Alert tone="warning">
                <TriangleAlert aria-hidden />
                <p>{tb('cors')}</p>
              </Alert>
              <CopyableCode
                language="json"
                code={JSON.stringify(corsRulesFor(location.origin), null, 2)}
                labels={{ copy: tc('copy'), copied: tc('copied') }}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {choice === 'drive' ? (
        <Suspense fallback={null}>
          <DrivePanel doc={doc} onSaved={onSaved} />
        </Suspense>
      ) : null}

      {target !== undefined && choice === value.mode && !dirty ? (
        <Suspense fallback={null}>
          <MoveRecordings doc={doc} target={target} />
        </Suspense>
      ) : null}
    </ProviderCard>
  );
}
