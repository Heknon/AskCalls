'use client';

import { ApiError } from '@askcalls/api-contract';
import { DeviceLinkJoiner, parseLinkCode } from '@askcalls/client-core/device-link';
import { addUnlockMethod } from '@askcalls/client-core/keys';
import { estimatePassphraseStrength, isCryptoError } from '@askcalls/crypto';
import { isDomainError } from '@askcalls/domain';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { FingerprintCode } from '@askcalls/ui/components/FingerprintCode';
import { GateHeading } from '@askcalls/ui/components/Gate';
import { PassphraseField } from '@askcalls/ui/components/PassphraseField';
import { Alert } from '@askcalls/ui/primitives/alert';
import { Button } from '@askcalls/ui/primitives/button';
import { Input } from '@askcalls/ui/primitives/input';
import { Label } from '@askcalls/ui/primitives/label';
import { Spinner } from '@askcalls/ui/primitives/spinner';
import { KeyRound, Link2, TriangleAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import type { BrowserClient } from '../../../../../../client/browser-client';
import { describeDevice } from '../../../../../../client/session/device-label';
import type { Me } from '../../../../../../client/session/session';

/** The link server allows 120 `fetch` polls per 10 minutes, the life of a link session. */
const POLL_MS = 5_000;

type EnterError = 'invalid' | 'otherAccount' | 'failed';
type Step =
  | { step: 'enter'; joining: boolean; error: EnterError | null }
  | { step: 'compare'; joiner: DeviceLinkJoiner }
  | { step: 'expired' }
  | { step: 'protect' };

/** The code from a scanned QR (`/app/link#<code>`) or a pasted link or code. */
function codeFrom(text: string): string {
  const t = text.trim();
  const hash = t.indexOf('#');
  return hash >= 0 ? t.slice(hash + 1) : t;
}

/**
 * Joins with the code, shows the fingerprint until the trusted device confirms, then protects
 * the root key with a new passkey, or a passphrase when this browser's passkeys have no PRF.
 */
export function LinkFlow({ client, me }: { client: BrowserClient; me: Me }) {
  const t = useTranslations('unlock');
  const [code, setCode] = useState('');
  const [state, setState] = useState<Step>({ step: 'enter', joining: false, error: null });
  const { browser, os } = describeDevice(navigator.userAgent);
  const deviceLabel = t('deviceLabel', { browser, os });

  const join = useCallback(
    async (text: string) => {
      const value = codeFrom(text);
      let userId: string;
      try {
        userId = parseLinkCode(value).userId;
      } catch {
        return setState({ step: 'enter', joining: false, error: 'invalid' });
      }
      if (userId !== me.user.id) {
        return setState({ step: 'enter', joining: false, error: 'otherAccount' });
      }
      setState({ step: 'enter', joining: true, error: null });
      try {
        const joiner = await DeviceLinkJoiner.join({
          api: client.api,
          code: value,
          deviceLabel,
          deviceKeys: client.deviceKeys,
        });
        setState({ step: 'compare', joiner });
      } catch (e) {
        const gone = e instanceof ApiError && e.status === 404;
        setState(gone ? { step: 'expired' } : { step: 'enter', joining: false, error: 'failed' });
      }
    },
    [client, me.user.id, deviceLabel],
  );

  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      // The secret stays out of the history and the address bar.
      history.replaceState(null, '', window.location.pathname);
      setCode(hash);
      void join(hash);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [join]);

  useEffect(() => {
    if (state.step !== 'compare') return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const r = await state.joiner.poll({
          session: client.session,
          deviceKeys: client.deviceKeys,
          storage: { kind: 'session' },
        });
        if (stop) return;
        if (r.state === 'completed') return setState({ step: 'protect' });
        if (r.state === 'expired') return setState({ step: 'expired' });
      } catch {
        if (!stop) return setState({ step: 'enter', joining: false, error: 'failed' });
      }
      if (!stop) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [state, client]);

  const again = () => {
    setCode('');
    setState({ step: 'enter', joining: false, error: null });
  };

  if (state.step === 'compare') {
    return (
      <>
        <GateHeading
          icon={Link2}
          title={t('join.compareTitle')}
          description={<p>{t('join.compareBody')}</p>}
        />
        <div className="flex justify-center rounded-lg border border-border bg-background px-4 py-6">
          <FingerprintCode digits={state.joiner.fingerprint} />
        </div>
        <p role="status" className="flex items-center gap-2 text-muted-foreground text-sm">
          <Spinner className="size-4" />
          {t('join.waiting')}
        </p>
      </>
    );
  }
  if (state.step === 'expired') {
    return (
      <>
        <GateHeading icon={Link2} title={t('join.title')} />
        <ErrorState
          scope="panel"
          title={t('join.expired')}
          retry={{ label: t('join.again'), onRetry: again }}
        />
      </>
    );
  }
  if (state.step === 'protect') {
    return <Protect client={client} me={me} deviceLabel={deviceLabel} />;
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void join(code);
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <GateHeading icon={Link2} title={t('join.title')} description={<p>{t('join.body')}</p>} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="link-code">{t('join.codeLabel')}</Label>
        <Input
          id="link-code"
          dir="ltr"
          autoComplete="off"
          spellCheck={false}
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (state.error) setState({ step: 'enter', joining: false, error: null });
          }}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? 'link-code-error' : undefined}
        />
        {state.error ? (
          <p id="link-code-error" className="text-destructive text-sm">
            {t(`join.${state.error}`)}
          </p>
        ) : null}
      </div>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="w-full"
        loading={state.joining}
        disabled={!code.trim()}
      >
        {state.joining ? t('join.joining') : t('join.submit')}
      </Button>
    </form>
  );
}

type Protection = 'idle' | 'waiting' | 'cancelled' | 'noPrf' | 'passphrase';

/** RK is in memory only: keep it with a new passkey, or a passphrase. */
function Protect({
  client,
  me,
  deviceLabel,
}: {
  client: BrowserClient;
  me: Me;
  deviceLabel: string;
}) {
  const t = useTranslations('unlock.join');
  const to = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();
  const [mode, setMode] = useState<Protection>('idle');
  const [pass, setPass] = useState('');
  const [againValue, setAgain] = useState('');
  const [error, setError] = useState<'short' | 'mismatch' | 'failed' | null>(null);
  const [saving, setSaving] = useState(false);
  const opts = { api: client.api, session: client.session };
  const hasPassphrase = me.keyring.entries.some(
    (e) => e.kind === 'passphrase' && e.revokedAt === null,
  );
  const finish = () => router.replace('/app');

  const createPasskey = async () => {
    setMode('waiting');
    try {
      const { added } = await addUnlockMethod(opts, {
        method: 'passkey',
        authenticator: client.passkeys,
        userName: me.user.email ?? me.user.name ?? deviceLabel,
        label: deviceLabel,
      });
      if (added) return finish();
      setMode('noPrf');
    } catch (e) {
      setMode(isDomainError(e) && e.code === 'unsupported' ? 'noPrf' : 'cancelled');
    }
  };

  const savePassphrase = async (e: FormEvent) => {
    e.preventDefault();
    if (!estimatePassphraseStrength(pass).acceptable) return setError('short');
    if (pass !== againValue) return setError('mismatch');
    setSaving(true);
    try {
      await addUnlockMethod(opts, {
        method: 'passphrase',
        passphrase: pass,
        label: to('pass.label'),
      });
      finish();
    } catch (err) {
      setSaving(false);
      setError(isCryptoError(err, 'weak_passphrase') ? 'short' : 'failed');
    }
  };

  if (mode === 'passphrase') {
    const { score } = estimatePassphraseStrength(pass);
    const word = score <= 1 ? 'weak' : score === 2 ? 'fair' : 'strong';
    return (
      <form onSubmit={savePassphrase} noValidate className="flex flex-col gap-6">
        <GateHeading title={t('passTitle')} />
        <div className="flex flex-col gap-4">
          <PassphraseField
            mode="create"
            label={to('pass.label')}
            value={pass}
            onChange={(v) => {
              setPass(v);
              setError(null);
            }}
            hint={to('pass.hint')}
            strength={pass ? { score, label: to(`pass.strength.${word}`) } : undefined}
            error={error === 'short' ? to('pass.short') : undefined}
            labels={{ show: tc('show'), hide: tc('hide') }}
          />
          <PassphraseField
            mode="enter"
            label={to('pass.confirm')}
            value={againValue}
            onChange={(v) => {
              setAgain(v);
              setError(null);
            }}
            error={error === 'mismatch' ? to('pass.mismatch') : undefined}
            labels={{ show: tc('show'), hide: tc('hide') }}
          />
        </div>
        {error === 'failed' ? <ErrorState scope="inline" title={to('pass.failed')} /> : null}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={saving}>
          {saving ? to('pass.creating') : t('passCta')}
        </Button>
      </form>
    );
  }

  if (mode === 'noPrf') {
    return (
      <>
        <GateHeading icon={KeyRound} title={t('protectTitle')} />
        <Alert tone="warning" role="alert">
          <TriangleAlert aria-hidden />
          <span>{hasPassphrase ? t('hasPassphrase') : t('noPrf')}</span>
        </Alert>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          autoFocus
          onClick={hasPassphrase ? finish : () => setMode('passphrase')}
        >
          {hasPassphrase ? t('done') : t('usePassphrase')}
        </Button>
      </>
    );
  }

  return (
    <>
      <GateHeading
        icon={KeyRound}
        title={t('protectTitle')}
        description={<p>{t('protectBody')}</p>}
      />
      {mode === 'cancelled' ? <ErrorState scope="inline" title={t('passkeyCancelled')} /> : null}
      <div className="flex flex-col gap-2.5">
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          autoFocus
          loading={mode === 'waiting'}
          onClick={createPasskey}
        >
          {mode === 'waiting' ? t('passkeyWaiting') : t('passkey')}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="w-full"
          disabled={mode === 'waiting'}
          onClick={() => (hasPassphrase ? finish() : setMode('passphrase'))}
        >
          {hasPassphrase ? t('done') : t('usePassphrase')}
        </Button>
      </div>
    </>
  );
}
