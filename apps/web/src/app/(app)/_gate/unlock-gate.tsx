'use client';

import { unlock } from '@askcalls/client-core/keys';
import { isCryptoError } from '@askcalls/crypto';
import { isDomainError } from '@askcalls/domain';
import { CodeGroupInput } from '@askcalls/ui/components/CodeGroupInput';
import { ConfirmDialog } from '@askcalls/ui/components/ConfirmDialog';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { GateAccount, GateHeading, GateNote } from '@askcalls/ui/components/Gate';
import { PassphraseField } from '@askcalls/ui/components/PassphraseField';
import { Button } from '@askcalls/ui/primitives/button';
import { ArrowLeft, KeyRound, Lock } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { LanguageControl } from '../../../client/i18n/language-switcher';
import { describeDevice } from '../../../client/session/device-label';
import { type Me, useAppSession } from '../../../client/session/session';
import { GateFrame } from '../../_gate/gate-frame';

type View = 'methods' | 'recovery' | 'passphrase';
type Failure = 'passkey' | 'recovery' | 'passphrase' | 'offline' | 'other' | null;

const GROUPS = 8;

export function initials(me: Me): string {
  const source = me.user.name?.trim() || me.user.email || '?';
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/**
 * The unlock gate (G1): turns a user gesture into the root key. Rendered in place of any app
 * route while locked, so the requested route shows as soon as the keys are in memory.
 */
export function UnlockGate() {
  const t = useTranslations('unlock');
  const tc = useTranslations('common');
  const { me, client, signOut, lastLock } = useAppSession();
  const [view, setView] = useState<View>('methods');
  const [busy, setBusy] = useState<View | 'passkey' | null>(null);
  const [failure, setFailure] = useState<Failure>(null);
  const [groups, setGroups] = useState<string[]>(() => Array(GROUPS).fill(''));
  const [passphrase, setPassphrase] = useState('');
  const [confirmOut, setConfirmOut] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (view !== 'methods') form.current?.querySelector('input')?.focus();
  }, [view]);

  if (!me || !client) return null;
  const active = me.keyring.entries.filter((e) => e.revokedAt === null);
  const hasPasskey = active.some((e) => e.kind === 'passkey');
  const hasPassphrase = active.some((e) => e.kind === 'passphrase');
  const { browser, os } = describeDevice(navigator.userAgent);

  const run = async (method: 'passkey' | 'recovery' | 'passphrase') => {
    setBusy(method);
    setFailure(null);
    try {
      const input =
        method === 'passkey'
          ? { method, authenticator: client.passkeys }
          : method === 'recovery'
            ? { method, code: groups.join('') }
            : { method, passphrase };
      await unlock(input, {
        api: client.api,
        session: client.session,
        userId: me.user.id,
        deviceKeys: client.deviceKeys,
        registerDeviceLabel: t('deviceLabel', { browser, os }),
      });
    } catch (e) {
      if (!navigator.onLine) setFailure('offline');
      else if (isCryptoError(e) || method === 'passkey') setFailure(method);
      else if (isDomainError(e) && e.code === 'not_found') setFailure(method);
      else setFailure('other');
      setBusy(null);
    }
  };

  const back = () => {
    setView('methods');
    setFailure(null);
  };
  const onEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && view !== 'methods') back();
  };
  const submit = (method: 'recovery' | 'passphrase') => (e: FormEvent) => {
    e.preventDefault();
    if (method === 'recovery' && groups.some((g) => g.length !== 4)) {
      setFailure('recovery');
      return;
    }
    void run(method);
  };

  const offline =
    failure === 'offline' ? <ErrorState scope="panel" title={t('offline')} /> : null;
  const other = failure === 'other' ? <ErrorState scope="panel" title={t('failed')} /> : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Esc in a sub-form returns to the methods
    <div onKeyDown={onEsc}>
      <GateFrame end={<LanguageControl />}>
        <p className="sr-only" aria-live="assertive">
          {lastLock ? t('locked') : null}
        </p>
        {view === 'methods' ? (
          <>
            <GateHeading
              icon={Lock}
              title={t('title')}
              description={<p>{hasPasskey ? t('body') : t('bodyNoPasskey')}</p>}
            />
            {offline}
            {other}
            <div className="flex flex-col gap-2.5">
              {hasPasskey ? (
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  autoFocus
                  loading={busy === 'passkey'}
                  onClick={() => run('passkey')}
                >
                  {busy === 'passkey' ? null : <KeyRound className="size-4" aria-hidden />}
                  {busy === 'passkey' ? t('waiting') : t('passkey')}
                </Button>
              ) : null}
              {failure === 'passkey' ? (
                <ErrorState scope="inline" title={t('passkeyFailed')} />
              ) : null}
              <Button
                variant={hasPasskey ? 'outline' : 'primary'}
                size="lg"
                className="w-full"
                autoFocus={!hasPasskey}
                onClick={() => {
                  setView('recovery');
                  setFailure(null);
                }}
              >
                {t('recovery')}
              </Button>
              {hasPassphrase ? (
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    setView('passphrase');
                    setFailure(null);
                  }}
                >
                  {t('passphrase')}
                </Button>
              ) : null}
            </div>
            <GateAccount
              initials={initials(me)}
              action={
                <Button variant="link" size="sm" onClick={() => setConfirmOut(true)}>
                  {t('signOut')}
                </Button>
              }
            >
              {t.rich('account', { email: () => <bdi>{me.user.email ?? me.user.name}</bdi> })}
            </GateAccount>
            <GateNote>
              {t.rich('lost', { link: (c) => <Link href="/security">{c}</Link> })}
            </GateNote>
          </>
        ) : (
          <>
            <div>
              <Button variant="link" size="sm" onClick={back}>
                <ArrowLeft className="icon-directional size-4" aria-hidden />
                {t('back')}
              </Button>
            </div>
            <form
              ref={form}
              onSubmit={submit(view)}
              className="flex flex-col gap-6"
              noValidate
            >
              {view === 'recovery' ? (
                <>
                  <GateHeading title={t('rc.title')} description={<p>{t('rc.body')}</p>} />
                  <CodeGroupInput
                    values={groups}
                    onChange={(v) => {
                      setGroups(v);
                      if (failure === 'recovery') setFailure(null);
                    }}
                    groupLength={4}
                    labels={Array.from({ length: GROUPS }, (_, i) => t('rc.group', { n: i + 1 }))}
                    error={
                      failure === 'recovery'
                        ? groups.some((g) => g.length !== 4)
                          ? t('rc.incomplete')
                          : t('rc.wrong')
                        : undefined
                    }
                  />
                </>
              ) : (
                <>
                  <GateHeading title={t('pass.title')} />
                  <PassphraseField
                    mode="enter"
                    label={t('pass.label')}
                    value={passphrase}
                    onChange={(v) => {
                      setPassphrase(v);
                      if (failure === 'passphrase') setFailure(null);
                    }}
                    error={failure === 'passphrase' ? t('pass.wrong') : undefined}
                    labels={{ show: tc('show'), hide: tc('hide') }}
                  />
                </>
              )}
              {offline}
              {other}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                loading={busy === view}
              >
                {busy === view ? t('busy') : t('cta')}
              </Button>
            </form>
          </>
        )}
        <ConfirmDialog
          open={confirmOut}
          onOpenChange={setConfirmOut}
          title={t('signOutConfirm.title')}
          description={t('signOutConfirm.body')}
          confirmLabel={t('signOutConfirm.confirm')}
          cancelLabel={tc('cancel')}
          onConfirm={() => void signOut()}
        />
      </GateFrame>
    </div>
  );
}
