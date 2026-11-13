import { DEFAULT_LIMITS } from '@askcalls/domain';
import { FaqList } from '@askcalls/ui/components/FaqList';
import { getTranslations } from 'next-intl/server';
import { faqItems } from '../_components/faq';
import { LimitsSheet } from '../_components/limits';
import { meta } from '../_components/meta';
import { ArrowLink, Cmd, SiteEnd, SiteHeader, Term } from '../_components/site';

export const generateMetadata = meta('pricing', '/pricing');

export default async function PricingPage() {
  const t = await getTranslations('marketing.pricingPage');
  const max = DEFAULT_LIMITS.maxCalls;
  return (
    <>
      <div className="ink">
        <SiteHeader path="/pricing" />
        <section className="phero" aria-labelledby="t">
          <div className="wrap row">
            <h1 className="h1" id="t">
              {t('titleA')} <br />
              {t('titleB')}
            </h1>
            <div>
              <p className="sub">
                {t('subA')} <span className="muted">{t('subB')}</span>
              </p>
              <div className="ctas">
                <a className="btn btn-primary" href="/login">
                  {(await getTranslations('marketing.common'))('start')}
                </a>
              </div>
            </div>
          </div>
        </section>
      </div>

      <main id="main">
        <section className="ch ch-first" aria-labelledby="lim-t">
          <div className="wrap">
            <h2 className="sr-only" id="lim-t">
              {t('limitsTitle')}
            </h2>
            <p className="sheet-cap">{t('caption')}</p>
            <LimitsSheet />
          </div>
        </section>

        <section className="ch ch-tight" aria-labelledby="cnt-t">
          <div className="wrap counts">
            <h2 className="h2" id="cnt-t">
              {t('countsTitle')}
            </h2>
            <ul className="rules">
              {(['ownKeys', 'duplicates', 'free'] as const).map((k) => (
                <li key={k}>
                  <p className="t">{t(`${k}.t`)}</p>
                  <p className="d">{t(`${k}.d`)}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="ch ch-tight" aria-label={t('atLimitLabel')}>
          <div className="wrap limit">
            <p className="state">
              {t('atLimitA')} <span className="muted">{t('atLimitB')}</span>
            </p>
            <div className="meter" aria-hidden>
              <div className="bar">
                <i />
              </div>
              <div className="lbl">
                <span>{t('meterCalls')}</span>
                <span className="tab">
                  <bdi>
                    <b>{max}</b> / {max}
                  </bdi>
                </span>
              </div>
              <div className="note">
                <span>
                  <i className="dot-off" />
                  {t('paused')}
                </span>
                <span>
                  <i className="dot-on" />
                  {t('search')}
                </span>
                <span>
                  <i className="dot-on" />
                  {t('reading')}
                </span>
                <span>
                  <i className="dot-on" />
                  {t('export')}
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="ink ch" aria-labelledby="self-t">
          <div className="wrap self">
            <div>
              <h2 className="h2" id="self-t">
                {t('selfTitleA')} <br />
                {t('selfTitleB')}
              </h2>
              <p className="lead">{t('selfLead')}</p>
              <ArrowLink href="/self-host">{t('selfLink')}</ArrowLink>
            </div>
            <Term bar="~">
              <Cmd>git clone https://github.com/Heknon/AskCalls.git</Cmd>
              <Cmd>cd AskCalls/docker</Cmd>
              <Cmd>docker compose up</Cmd>
              <span className="dim"># then open http://localhost:3000</span>
            </Term>
          </div>
        </section>

        <section className="ch" aria-labelledby="faq-t">
          <div className="wrap faq-g">
            <h2 className="h2" id="faq-t">
              {t('faqTitleA')} <br />
              {t('faqTitleB')}
            </h2>
            <FaqList items={await faqItems(['limit', 'ownKeys', 'selfHostFree'])} open="limit" />
          </div>
        </section>
      </main>
      <SiteEnd />
    </>
  );
}
