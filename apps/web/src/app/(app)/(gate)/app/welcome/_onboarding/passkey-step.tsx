'use client';

import type { Onboarding } from '@askcalls/client-core/keys';
import { estimatePassphraseStrength, isCryptoError } from '@askcalls/crypto';
import { isDomainError } from '@askcalls/domain';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { GateHeading } from '@askcalls/ui/components/Gate';
import { PassphraseField } from '@askcalls/ui/components/PassphraseField';
import { Alert } from '@askcalls/ui/primitives/alert';
import { Button } from '@askcalls/ui/primitives/button';
import { CircleCheck, KeyRound, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import type { BrowserClient } from '../../../../../../client/browser-client';

type State = 'idle' | 'waiting' | 'done' | 'cancelled' | 'noPrf' | 'passwordManager';

/** O2 and O2b: a passkey with PRF, or the passphrase when the browser can't. */
export function PasskeyStep({
  onboarding,
  client,
  userName,
  deviceLabel,
  onDone,
}: {
  onboarding: Onboarding;
  client: BrowserClient;
  userName: string;
  deviceLabel: string;
  onDone: () => void;
}) {
  const t = useTranslations('onboarding');
  const tc = useTranslations('common');
  const [mode, setMode] = useState<'passkey' | 'passphrase'>('passkey');
  const [state, setState] = useState<State>('idle');
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<'short' | 'mismatch' | 'failed' | null>(null);
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setState('waiting');
    try {
      const result = await onboarding.addPasskey(client.passkeys, { userName, label: deviceLabel });
      if (!result.added) {
        setState(result.reason === 'passwordManager' ? 'passwordManager' : 'noPrf');
        return;
      }
      setState('done');
      setTimeout(onDone, 1_000);
    } catch (e) {
      setState(isDomainError(e) && e.code === 'unsupported' ? 'noPrf' : 'cancelled');
    }
  };

  const submitPassphrase = async (e: FormEvent) => {
    e.preventDefault();
    if (!estimatePassphraseStrength(pass).acceptable) return setError('short');
    if (pass !== again) return setError('mismatch');
    setCreating(true);
    try {
      await onboarding.addPassphrase(pass, t('pass.label'));
      onDone();
    } catch (err) {
      setCreating(false);
      setError(isCryptoError(err, 'weak_passphrase') ? 'short' : 'failed');
    }
  };

  if (mode === 'passphrase') {
    const { score } = estimatePassphraseStrength(pass);
    const word = score <= 1 ? 'weak' : score === 2 ? 'fair' : 'strong';
    return (
      <form onSubmit={submitPassphrase} noValidate className="flex flex-col gap-6">
        <GateHeading title={t('pass.title')} />
        <div className="flex flex-col gap-4">
          <PassphraseField
            mode="create"
            label={t('pass.label')}
            value={pass}
            onChange={(v) => {
              setPass(v);
              setError(null);
            }}
            hint={t('pass.hint')}
            strength={pass ? { score, label: t(`pass.strength.${word}`) } : undefined}
            error={error === 'short' ? t('pass.short') : undefined}
            labels={{ show: tc('show'), hide: tc('hide') }}
          />
          <PassphraseField
            mode="enter"
            label={t('pass.confirm')}
            value={again}
            onChange={(v) => {
              setAgain(v);
              setError(null);
            }}
            error={error === 'mismatch' ? t('pass.mismatch') : undefined}
            labels={{ show: tc('show'), hide: tc('hide') }}
          />
        </div>
        {error === 'failed' ? <ErrorState scope="inline" title={t('pass.failed')} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" size="lg" loading={creating}>
            {creating ? t('pass.creating') : t('pass.cta')}
          </Button>
          {state !== 'noPrf' ? (
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setMode('passkey')}
              disabled={creating}
            >
              {t('pass.back')}
            </Button>
          ) : null}
        </div>
      </form>
    );
  }

  return (
    <>
      <GateHeading
        icon={KeyRound}
        title={t('passkey.title')}
        description={<p>{t('passkey.body')}</p>}
      />
      {state === 'noPrf' ? (
        <>
          <Alert tone="warning" role="alert">
            <TriangleAlert aria-hidden />
            <div className="flex flex-col gap-1">
              <span>{t('passkey.noPrf')}</span>
              <span>{t('passkey.browsers')}</span>
            </div>
          </Alert>
          <div>
            <Button variant="primary" size="lg" autoFocus onClick={() => setMode('passphrase')}>
              {t('passkey.usePassphrase')}
            </Button>
          </div>
        </>
      ) : state === 'passwordManager' ? (
        <>
          <Alert tone="warning" role="alert">
            <TriangleAlert aria-hidden />
            <span>{t('passkey.passwordManager')}</span>
          </Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="lg" autoFocus onClick={create}>
              {tc('retry')}
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setMode('passphrase')}>
              {t('passkey.alt')}
            </Button>
          </div>
        </>
      ) : state === 'done' ? (
        <p role="status" className="flex items-center gap-2">
          <CircleCheck className="size-5" aria-hidden />
          {t('passkey.done')}
        </p>
      ) : (
        <>
          {state === 'cancelled' ? (
            <ErrorState scope="inline" title={t('passkey.cancelled')} />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="lg"
              autoFocus
              loading={state === 'waiting'}
              onClick={create}
            >
              {state === 'waiting' ? t('passkey.waiting') : t('passkey.cta')}
            </Button>
            <Button
              variant="ghost"
              size="lg"
              disabled={state === 'waiting'}
              onClick={() => setMode('passphrase')}
            >
              {t('passkey.alt')}
            </Button>
          </div>
        </>
      )}
    </>
  );
}
