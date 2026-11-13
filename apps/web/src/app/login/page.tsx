import { cookies, headers } from 'next/headers';
import { enabledProviders } from '../../server/auth/config';
import { signIn } from '../../server/auth/nextauth';
import { getContainer } from '../../server/container';
import { resolveLocale, translator } from '../../server/i18n/translator';
import { OneTap } from './one-tap';

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
  const locale = resolveLocale(
    (await cookies()).get('locale')?.value,
    (await headers()).get('accept-language'),
  );
  const { t, dir } = translator(locale, 'login');
  const { config } = await getContainer();
  const providers = enabledProviders(config);
  const has = (id: string) => providers.some((p) => p.id === id);
  const redirectTo = safeCallback(sp.callbackUrl);
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error;

  async function oauth(formData: FormData) {
    'use server';
    const provider = String(formData.get('provider'));
    if (provider !== 'google' && provider !== 'github') return;
    await signIn(provider, { redirectTo: safeCallback(String(formData.get('redirectTo'))) });
  }
  async function email(formData: FormData) {
    'use server';
    await signIn('nodemailer', {
      email: String(formData.get('email') ?? ''),
      redirectTo: safeCallback(String(formData.get('redirectTo'))),
    });
  }
  async function test(formData: FormData) {
    'use server';
    await signIn('test', {
      email: String(formData.get('email') ?? ''),
      redirectTo: safeCallback(String(formData.get('redirectTo'))),
    });
  }

  return (
    <main dir={dir} lang={locale}>
      <h1>{t('title')}</h1>
      {sp.check === 'email' && <p role="status">{t('checkEmail')}</p>}
      {error && (
        <p role="alert">{error === 'OAuthAccountNotLinked' ? t('accountNotLinked') : t('error')}</p>
      )}
      {providers.length === 0 && <p>{t('noProviders')}</p>}
      {(['google', 'github'] as const).filter(has).map((id) => (
        <form key={id} action={oauth}>
          <input type="hidden" name="provider" value={id} />
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <button type="submit">{t(id)}</button>
        </form>
      ))}
      {has('nodemailer') && (
        <form action={email}>
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label>
            {t('emailLabel')}
            <input type="email" name="email" required autoComplete="email" />
          </label>
          <button type="submit">{t('emailSubmit')}</button>
        </form>
      )}
      {has('test') && (
        <form action={test}>
          <input type="hidden" name="redirectTo" value={redirectTo} />
          <label>
            {t('testLabel')}
            <input type="email" name="email" required />
          </label>
          <button type="submit">{t('testSubmit')}</button>
        </form>
      )}
      {has('google-one-tap') && config.config.auth.google.id && (
        <OneTap clientId={config.config.auth.google.id} redirectTo={redirectTo} />
      )}
    </main>
  );
}
