'use client';

import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { Button } from '@askcalls/ui/primitives/button';
import { Input } from '@askcalls/ui/primitives/input';
import { Label } from '@askcalls/ui/primitives/label';
import { KeyRound } from 'lucide-react';
import { signIn as passwordSignIn } from 'next-auth/react';
import { signIn as passkeySignIn } from 'next-auth/webauthn';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';

const PASSWORD_MIN = 12;

/** "Sign in with a passkey": a discoverable credential, no email needed. */
export function PasskeySignIn({ redirectTo }: { redirectTo: string }) {
  const t = useTranslations('auth');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            await passkeySignIn('passkey', { redirectTo });
          } catch {
            setFailed(true);
            setBusy(false);
          }
        }}
      >
        <KeyRound className="size-4" aria-hidden />
        {t('passkey')}
      </Button>
      {failed ? <ErrorState scope="inline" title={t('error.passkey')} /> : null}
    </div>
  );
}

/**
 * Local accounts (AUTH_LOCAL_ACCOUNTS): email and password, and creating an account with a
 * passkey or a password.
 */
export function LocalAccountForm({ redirectTo }: { redirectTo: string }) {
  const t = useTranslations('auth');
  const id = useId();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'password' | 'passkey'>(null);
  const [error, setError] = useState<null | 'email' | 'password' | 'passkey'>(null);

  const withEmail = () => {
    if (!email.trim()) {
      setError('email');
      return false;
    }
    return true;
  };
  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!withEmail()) return;
    if (mode === 'signin' ? !password : password.length < PASSWORD_MIN) {
      setError('password');
      return;
    }
    setBusy('password');
    await passwordSignIn('password', { email, password, mode, redirectTo });
  };
  const createWithPasskey = async () => {
    if (!withEmail()) return;
    setBusy('passkey');
    try {
      await passkeySignIn('passkey', { email, action: 'register', redirectTo });
    } catch {
      setError('passkey');
      setBusy(null);
    }
  };

  return (
    <form onSubmit={submitPassword} noValidate className="flex flex-col gap-3">
      {mode === 'signup' ? (
        <h2 className="font-semibold text-md">{t('local.createTitle')}</h2>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-e`}>{t('email')}</Label>
        <Input
          id={`${id}-e`}
          type="email"
          dir="ltr"
          autoComplete={mode === 'signin' ? 'username webauthn' : 'email'}
          placeholder={t('emailPlaceholder')}
          value={email}
          aria-invalid={error === 'email' || undefined}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
          }}
        />
        {error === 'email' ? <ErrorState scope="inline" title={t('error.email')} /> : null}
      </div>
      {mode === 'signup' ? (
        <>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="w-full"
            loading={busy === 'passkey'}
            onClick={() => void createWithPasskey()}
          >
            <KeyRound className="size-4" aria-hidden />
            {t('local.createPasskey')}
          </Button>
          {error === 'passkey' ? <ErrorState scope="inline" title={t('error.passkey')} /> : null}
        </>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-p`}>{t('local.password')}</Label>
        <Input
          id={`${id}-p`}
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          aria-invalid={error === 'password' || undefined}
          aria-describedby={mode === 'signup' ? `${id}-h` : undefined}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
        />
        {mode === 'signup' ? (
          <span id={`${id}-h`} className="text-muted-foreground text-sm">
            {t('local.passwordHint')}
          </span>
        ) : null}
        {error === 'password' ? (
          <ErrorState
            scope="inline"
            title={mode === 'signin' ? t('error.password') : t('local.passwordHint')}
          />
        ) : null}
      </div>
      <Button
        type="submit"
        variant={mode === 'signin' ? 'primary' : 'secondary'}
        size="lg"
        className="w-full"
        loading={busy === 'password'}
      >
        {busy === 'password'
          ? t('local.signingIn')
          : mode === 'signin'
            ? t('local.signIn')
            : t('local.createPassword')}
      </Button>
      <Button
        type="button"
        variant="link"
        className="self-center"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin');
          setError(null);
        }}
      >
        {mode === 'signin' ? t('local.create') : t('local.haveAccount')}
      </Button>
    </form>
  );
}
