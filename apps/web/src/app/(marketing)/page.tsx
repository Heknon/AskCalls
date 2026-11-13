import { DemoFrame, type DemoQuery } from '@askcalls/ui/components/DemoFrame';
import { FaqList } from '@askcalls/ui/components/FaqList';
import { StepList } from '@askcalls/ui/components/StepList';
import { getTranslations } from 'next-intl/server';
import { enabledProviders } from '../../server/auth/config';
import { getContainer } from '../../server/container';
import { requestLocale } from '../../server/i18n/locale';
import { OneTap } from '../login/one-tap';
import { CallViewCrop } from './_components/call-view';
import { faqItems } from './_components/faq';
import { HomeLimits } from './_components/limits';
import { meta } from './_components/meta';
import { PrivacyDiagram } from './_components/privacy';
import { PlaintextRoutes } from './_components/routes-table';
import { ArrowLink, bold, Cmd, SiteEnd, SiteHeader } from './_components/site';
import { UseCases } from './_components/uses';
import { GITHUB_URL, LEAK_TEST_URL } from './_data/routes';

export const generateMetadata = meta('home', '/');

type RawQuery = { query: string; rows: Record<string, DemoQuery['rows'][number]> };

export default async function HomePage() {
  const [t, locale, { config }] = await Promise.all([
    getTranslations('marketing'),
    requestLocale(),
    getContainer(),
  ]);
  const oneTap =
    enabledProviders(config).some((p) => p.id === 'google-one-tap') && config.config.auth.google.id;
  // A message subtree, not a leaf: next-intl's key type only lists leaves.
  const raw = (t.raw as (key: string) => unknown)('home.demo.queries') as Record<string, RawQuery>;
  const queries: DemoQuery[] = Object.values(raw).map((q) => ({
    query: q.query,
    rows: Object.values(q.rows),
  }));

  return (
    <>
      <div className="ink">
        <SiteHeader path="/" />
        <section className="hero" aria-labelledby="hero-t">
          <div className="wrap">
            <div className="hero-top">
              <h1 className="h1" id="hero-t">
                {t('home.hero.titleA')} <br />
                {t('home.hero.titleB')}
              </h1>
              <div className="hero-side">
                <p className="sub">
                  {t('home.hero.subA')} <span className="muted">{t('home.hero.subB')}</span>
                </p>
                <div className="ctas">
                  <a className="btn btn-primary" href="/login">
                    {t('common.start')}
                  </a>
                  <ArrowLink href={GITHUB_URL}>{t('common.source')}</ArrowLink>
                </div>
              </div>
            </div>
            <DemoFrame
              queries={queries}
              description={t('home.demo.description')}
              labels={{
                meaning: t('home.demo.meaning'),
                pause: t('home.demo.pause'),
                play: t('home.demo.play'),
                matched: t('home.demo.matched'),
                decrypted: t.raw('home.demo.decrypted') as string,
              }}
            />
          </div>
        </section>
      </div>

      <main id="main">
        <section className="ch" aria-label={t('home.how.label')}>
          <div className="wrap">
            <StepList
              steps={(['upload', 'find', 'ask'] as const).map((k) => ({
                key: k,
                title: t(`home.how.${k}.title`),
                note: t(`home.how.${k}.note`),
              }))}
            />
            <CallViewCrop locale={locale} />
          </div>
        </section>

        <section className="ink ch priv" aria-labelledby="priv-t">
          <div className="wrap">
            <h2 className="state" id="priv-t">
              {t('home.privacy.titleA')} <span className="muted">{t('home.privacy.titleB')}</span>
            </h2>
            <PrivacyDiagram locale={locale} />
            <div className="exc">
              <h3>{t('home.privacy.exceptionsTitle')}</h3>
              <PlaintextRoutes />
            </div>
            <div className="leak">
              <div className="zero" aria-hidden>
                0
              </div>
              <p>
                <span className="sr-only">0 </span>
                {t('home.privacy.leakA')} <span className="muted">{t('home.privacy.leakB')}</span>
              </p>
            </div>
            <div className="proof">
              <ArrowLink href="/security">{t('home.privacy.proofModel')}</ArrowLink>
              <ArrowLink href={GITHUB_URL}>{t('home.privacy.proofSource')}</ArrowLink>
              <ArrowLink href={LEAK_TEST_URL}>{t('home.privacy.proofLeak')}</ArrowLink>
              <ArrowLink href="/security#verify">{t('home.privacy.proofVerify')}</ArrowLink>
            </div>
          </div>
        </section>

        <section className="ch" aria-labelledby="uses-t">
          <div className="wrap">
            <div className="split-h">
              <h2 className="h2" id="uses-t">
                {t('home.uses.titleA')} <br />
                {t('home.uses.titleB')}
              </h2>
              <p className="lead">{t('home.uses.lead')}</p>
            </div>
            <UseCases />
          </div>
        </section>

        <section className="ch ch-tight" aria-labelledby="ai-t">
          <div className="wrap">
            <div className="split-h">
              <h2 className="h2" id="ai-t">
                {t('home.ai.titleA')} <br />
                {t('home.ai.titleB')}
              </h2>
              <p className="lead">{t('home.ai.lead')}</p>
            </div>
            <div className="screen" data-component="AgentDemo">
              <div className="convo">
                <p className="u" dir="auto">
                  {t('home.ai.question')}
                </p>
                <p className="tool" dir="ltr">
                  <span className="ok" aria-hidden>
                    ●
                  </span>
                  <span>
                    askcalls.search_calls
                    <span className="dim">
                      ({'{'} query: "delivery date", semantic: true {'}'})
                    </span>
                  </span>
                  <span className="res2">{t('home.ai.toolResult')}</span>
                </p>
                <p className="a" dir="auto">
                  {t.rich('home.ai.answer', { b: bold })}
                </p>
              </div>
              <div className="setup">
                <p className="sl">{t('home.ai.step1')}</p>
                <pre dir="ltr">
                  <Cmd>bunx askcalls login --url https://askcalls.com</Cmd>
                  <Cmd>bunx askcalls link</Cmd>
                  <span className="dim">{'  Fingerprint: 418 602\n'}</span>
                  <span className="ok">Linked as "MacBook".</span>
                </pre>
                <p className="sl">{t('home.ai.step2')}</p>
                <pre dir="ltr">
                  <Cmd>claude mcp add --scope user askcalls -- bunx askcalls mcp</Cmd>
                </pre>
                <ArrowLink href="/mcp">{t('home.ai.more')}</ArrowLink>
              </div>
            </div>
          </div>
        </section>

        <section className="ch ch-tight" aria-labelledby="price-t">
          <div className="wrap">
            <h2 className="h2" id="price-t">
              {t('home.pricing.title')}
            </h2>
            <HomeLimits />
            <div className="price-f">
              <p className="muted">{t('home.pricing.foot')}</p>
              <ArrowLink href="/pricing">{t('home.pricing.more')}</ArrowLink>
            </div>
          </div>
        </section>

        <section className="ch ch-tight" id="faq" aria-labelledby="faq-t">
          <div className="wrap faq-g">
            <h2 className="h2" id="faq-t">
              {t('home.faq.titleA')} <br />
              {t('home.faq.titleB')}
            </h2>
            <FaqList
              items={await faqItems(['legal', 'lost', 'staff', 'where', 'selfHost'])}
              open="lost"
            />
          </div>
        </section>
      </main>

      <SiteEnd sub />
      {oneTap ? <OneTap clientId={config.config.auth.google.id!} redirectTo="/app" /> : null}
    </>
  );
}
