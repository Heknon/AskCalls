'use client';

import { type Providers, randomId } from '@askcalls/client-core/userdata';
import { CopyableCode } from '@askcalls/ui/components/CopyableCode';
import { DataFlowNote } from '@askcalls/ui/components/DataFlowNote';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { HealthBadge } from '@askcalls/ui/components/HealthBadge';
import { JobProgress } from '@askcalls/ui/components/JobProgress';
import { MaskedSecret } from '@askcalls/ui/components/MaskedSecret';
import { ProviderCard, type ProviderChoice } from '@askcalls/ui/components/ProviderCard';
import { TestConnectionResult } from '@askcalls/ui/components/TestConnectionResult';
import { Alert } from '@askcalls/ui/primitives/alert';
import { Button } from '@askcalls/ui/primitives/button';
import { Input } from '@askcalls/ui/primitives/input';
import { FileAudio, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { type BucketConfig, corsRulesFor } from '../../../../../../../client/adapters/own-bucket';
import { normalizeOrigin } from '../../../../../../../client/direct-origins';
import { useNotify } from '../../../../../../../client/notices/notices';
import { useAppSession, useUnlocked } from '../../../../../../../client/session/session';
import { type TestOutcome, testBucket } from './connection-test';
import { Field, testDetail } from './key-card';
import { instanceRecordings, moveRecordings } from './move-recordings';
import { maskParts, useSaveProviders } from './save';

type Draft = Omit<BucketConfig, 'id'>;
const EMPTY: Draft = { endpoint: '', bucket: '', region: '', accessKeyId: '', secretAccessKey: '' };

/** Offers to move instance-bucket recordings to the user's bucket, on this device. */
function MoveRecordings({ bucketRef }: { bucketRef: string }) {
  const t = useTranslations('settings.prov.move');
  const { ctx } = useUnlocked();
  const { refreshMe } = useAppSession();
  const notify = useNotify();
  const [ids, setIds] = useState<string[] | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [failed, setFailed] = useState(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    instanceRecordings(ctx).then(
      (x) => !cancelled && setIds(x),
      () => !cancelled && setIds([]),
    );
    return () => {
      cancelled = true;
      abort.current?.abort();
    };
  }, [ctx]);

  if (!ids || ids.length === 0) return null;

  const start = async () => {
    abort.current = new AbortController();
    setDone(0);
    setFailed(0);
    const r = await moveRecordings(ctx, bucketRef, ids, {
      onProgress: setDone,
      signal: abort.current.signal,
    });
    setDone(null);
    setFailed(r.failed);
    if (r.moved > 0)
      notify({ kind: 'event', icon: FileAudio, title: t('done', { count: r.moved }) });
    void refreshMe().catch(() => {});
    setIds(await instanceRecordings(ctx).catch(() => []));
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <p className="font-medium">{t('title')}</p>
      <p className="text-muted-foreground text-sm">{t('body', { count: ids.length })}</p>
      {done !== null ? (
        <>
          <JobProgress
            done={done}
            total={ids.length}
            label={t('progress', { done, total: ids.length })}
            onStop={() => abort.current?.abort()}
            labels={{
              pause: t('pause'),
              resume: t('resume'),
              stop: t('stop'),
              progress: t('progressLabel'),
            }}
          />
          <p className="text-muted-foreground text-sm">{t('keepOpen')}</p>
        </>
      ) : (
        <div>
          <Button variant="outline" onClick={start}>
            {t('start')}
          </Button>
        </div>
      )}
      {failed > 0 ? <ErrorState scope="inline" title={t('failed', { count: failed })} /> : null}
    </div>
  );
}

/** Recording backups: the instance bucket, the user's own S3-compatible bucket, or off. */
export function BucketCard({
  value,
  onSaved,
}: {
  value: Providers['recordings'];
  onSaved: (doc: Providers) => void;
}) {
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
      const r = await save((p) => ({ ...p, recordings: next }));
      if (r.reloading) return;
      onSaved(r.doc);
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
    if (c === 'managed' || c === 'off') {
      if (value.mode !== c) void commit({ mode: c });
    }
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
    setTest({ state: 'done', outcome: await testBucket((b) => client.ownBuckets.probe(b), saved) });
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
  const status = value.mode === 'off' ? 'off' : choice === 'own' && dirty ? 'setup' : 'working';
  const flow = choice === 'own' ? 'recOwn' : choice === 'off' ? 'recOff' : 'recManaged';
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
          { value: 'off', label: t('choice.off'), disabled: saving },
        ],
      }}
    >
      <DataFlowNote
        route={choice === 'own' ? 'direct' : choice === 'off' ? 'off' : 'on-device'}
        nodes={{ device: td('device'), server: td('server'), provider: tb('provider') }}
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
          <MoveRecordings bucketRef={saved.id} />
        </>
      ) : null}
    </ProviderCard>
  );
}
