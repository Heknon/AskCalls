import { getTranslations } from 'next-intl/server';
import { enabledProviders } from '../server/auth/config';
import { getContainer } from '../server/container';
import { OneTap } from './login/one-tap';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const t = await getTranslations('marketing');
  const { config } = await getContainer();
  const oneTap = enabledProviders(config).some((p) => p.id === 'google-one-tap');
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">{t('heroTitle')}</h1>
      <p className="mt-4 text-lg">{t('heroBody')}</p>
      {oneTap && config.config.auth.google.id ? (
        <OneTap clientId={config.config.auth.google.id} redirectTo="/app" />
      ) : null}
    </main>
  );
}
