import { getTranslations } from 'next-intl/server';
import { LegalPage } from '../_components/legal';
import { meta } from '../_components/meta';

export const generateMetadata = meta('subprocessors', '/subprocessors');

const ROWS = [
  ['Vercel', 'vercel'],
  ['Neon', 'neon'],
  ['Amazon Web Services', 'aws'],
  ['ElevenLabs', 'elevenlabs'],
  ['Anthropic', 'anthropic'],
] as const;

export default async function SubprocessorsPage() {
  const t = await getTranslations('marketing.legal.subprocessors');
  return (
    <LegalPage doc="subprocessors" path="/subprocessors">
      <section className="sec" aria-label={t('title')}>
        <table className="tbl">
          <thead>
            <tr>
              <th scope="col">{t('name')}</th>
              <th scope="col">{t('purpose')}</th>
              <th scope="col">{t('receives')}</th>
              <th scope="col">{t('location')}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([name, k]) => (
              <tr key={k}>
                <td>{name}</td>
                <td>{t(k)}</td>
                <td>{t(`${k}Data`)}</td>
                <td>{t(`${k}Where`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-6">{t('note')}</p>
      </section>
    </LegalPage>
  );
}
