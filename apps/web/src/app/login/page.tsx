import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { GateDivider, GateHeading, GateNote } from '@askcalls/ui/components/Gate';
import { Button } from '@askcalls/ui/primitives/button';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LanguageControl } from '../../client/i18n/language-switcher';
import { enabledProviders } from '../../server/auth/config';
import { signIn } from '../../server/auth/nextauth';
import { getContainer } from '../../server/container';
import { GateFrame } from '../_gate/gate-frame';
import { EmailSignIn, SentNotice } from './email-form';
import { LocalAccountForm, PasskeySignIn } from './local-form';
import { OneTap } from './one-tap';
import { ThisComputerSignIn } from './this-computer';

export const dynamic = 'force-dynamic';

/** Same-origin relative paths only. */
function safeCallback(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v?.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\') ? v : '/app';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const t = await getTranslations('auth');
  const { config } = await getContainer();
  const providers = enabledProviders(config);
  const has = (id: string) => providers.some((p) => p.id === id);
  const redirectTo = safeCallback(sp.callbackUrl);
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;
  const oauth = (['google', 'github'] as const).filter(has);
  const passkey = has('passkey');
  const forms = has('nodemailer') || has('test') || has('password');
  const buttons = oauth.length > 0 || passkey;
  const signInMethods = providers.filter((p) => p.kind !== 'setup').length;

  async function oauthAction(formData: FormData) {
    'use server';
    const provider = String(formData.get('provider'));
    if (provider !== 'google' && provider !== 'github') return;
    await signIn(provider, { redirectTo: safeCallback(String(formData.get('redirectTo'))) });
  }
  async function emailAction(formData: FormData) {
    'use server';
    await signIn('nodemailer', {
      email: String(formData.get('email') ?? ''),
      redirectTo: safeCallback(String(formData.get('redirectTo'))),
    });
  }
  async function localAction(formData: FormData) {
    'use server';
    await signIn('local', {
      key: String(formData.get('key') ?? ''),
      redirectTo: safeCallback(String(formData.get('redirectTo'))),
    });
  }
  async function testAction(formData: FormData) {
    'use server';
    await signIn('test', {
      email: String(formData.get('email') ?? ''),
      redirectTo: safeCallback(String(formData.get('redirectTo'))),
    });
  }

  return (
    <GateFrame end={<LanguageControl />}>
      {has('local') ? (
        <>
          <ThisComputerSignIn
            action={localAction}
            redirectTo={redirectTo}
            failed={error === 'CredentialsSignin'}
          />
          {has('test') ? (
            <EmailSignIn action={testAction} redirectTo={redirectTo} kind="test" />
          ) : null}
        </>
      ) : sp.check === 'email' ? (
        <SentNotice />
      ) : (
        <>
          <GateHeading title={t('title')} description={<p>{t('subtitle')}</p>} />
          {error ? (
            <ErrorState
              scope="panel"
              title={
                error === 'OAuthAccountNotLinked'
                  ? t('error.accountNotLinked')
                  : error === 'CredentialsSignin'
                    ? t('error.credentials')
                    : t('error.provider')
              }
            />
          ) : null}
          {signInMethods === 0 ? <ErrorState scope="panel" title={t('noProviders')} /> : null}
          {buttons ? (
            <div className="flex flex-col gap-3">
              {oauth.map((id) => (
                <form key={id} action={oauthAction}>
                  <input type="hidden" name="provider" value={id} />
                  <input type="hidden" name="redirectTo" value={redirectTo} />
                  <Button type="submit" variant="outline" size="lg" className="w-full">
                    {t(id)}
                  </Button>
                </form>
              ))}
              {passkey ? <PasskeySignIn redirectTo={redirectTo} /> : null}
            </div>
          ) : null}
          {buttons && forms ? <GateDivider label={t('or')} /> : null}
          {has('password') ? <LocalAccountForm redirectTo={redirectTo} /> : null}
          {has('nodemailer') ? (
            <EmailSignIn action={emailAction} redirectTo={redirectTo} kind="email" />
          ) : null}
          {has('test') ? (
            <EmailSignIn action={testAction} redirectTo={redirectTo} kind="test" />
          ) : null}
          <GateNote>
            {t.rich('legal', {
              terms: (c) => <Link href="/terms">{c}</Link>,
              privacy: (c) => <Link href="/privacy">{c}</Link>,
            })}
          </GateNote>
        </>
      )}
      {has('google-one-tap') && config.config.auth.google.id ? (
        <OneTap clientId={config.config.auth.google.id} redirectTo={redirectTo} />
      ) : null}
    </GateFrame>
  );
}
