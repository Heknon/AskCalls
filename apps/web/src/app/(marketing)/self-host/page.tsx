import { getTranslations } from 'next-intl/server';
import { meta } from '../_components/meta';
import { ArrowLink, Cmd, code, Doc, PageHero, SiteEnd, Term } from '../_components/site';
import { GITHUB_URL } from '../_data/routes';

export const generateMetadata = meta('selfHost', '/self-host');

const SECTIONS = ['compose', 'configure', 'offline', 'local'] as const;

export default async function SelfHostPage() {
  const t = await getTranslations('marketing.selfHostPage');
  return (
    <>
      <PageHero path="/self-host" title={t('title')} lead={t('lead')} />
      <Doc toc={SECTIONS.map((id) => ({ id, label: t(`toc.${id}`) }))}>
        <section className="sec" id="compose" aria-labelledby="compose-t">
          <h2 className="h2" id="compose-t">
            {t('compose.title')}
          </h2>
          <p>{t('compose.body')}</p>
          <Term bar="~">
            <Cmd>git clone https://github.com/Heknon/AskCalls.git</Cmd>
            <Cmd>cd AskCalls/docker</Cmd>
            <Cmd>docker compose up</Cmd>
            <span className="dim"># then open http://localhost:3000</span>
          </Term>
        </section>

        <section className="sec" id="configure" aria-labelledby="configure-t">
          <h2 className="h2" id="configure-t">
            {t('configure.title')}
          </h2>
          <p>{t.rich('configure.body', { code })}</p>
          <ol className="steps">
            {(['stepDb', 'stepBlob', 'stepAuth', 'stepProviders'] as const).map((k) => (
              <li key={k}>{t(`configure.${k}`)}</li>
            ))}
          </ol>
        </section>

        <section className="sec" id="offline" aria-labelledby="offline-t">
          <h2 className="h2" id="offline-t">
            {t('offline.title')}
          </h2>
          <p>{t.rich('offline.body', { code })}</p>
          <p>{t('offline.planned')}</p>
        </section>

        <section className="sec" id="local" aria-labelledby="local-t">
          <h2 className="h2" id="local-t">
            {t('local.title')}
          </h2>
          <p>{t.rich('local.body', { code })}</p>
          <p>{t('local.planned')}</p>
          <div className="refs">
            <ArrowLink href={GITHUB_URL}>{t('guide')}</ArrowLink>
          </div>
        </section>
      </Doc>
      <SiteEnd />
    </>
  );
}
