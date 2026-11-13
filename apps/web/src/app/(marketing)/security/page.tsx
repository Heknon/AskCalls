import { getTranslations } from 'next-intl/server';
import { requestLocale } from '../../../server/i18n/locale';
import { meta } from '../_components/meta';
import { PrivacyDiagram } from '../_components/privacy';
import { ArrowLink, Cmd, code, Doc, SiteEnd, SiteHeader, Term } from '../_components/site';
import { ADVISORY_URL, LEAK_TEST_URL } from '../_data/routes';

export const generateMetadata = meta('security', '/security');

const SECTIONS = [
  'stores',
  'plaintext',
  'keys',
  'unlock',
  'link',
  'verify',
  'leak',
  'report',
] as const;

/** Provider retention terms, from each adapter's README (packages/adapters/*). */
const RETENTION = [
  ['ElevenLabs', 'elevenlabs'],
  ['Deepgram', 'deepgram'],
  ['OpenAI (transcription)', 'openaiStt'],
  ['Soniox', 'soniox'],
  ['Anthropic', 'anthropic'],
  ['OpenAI (questions)', 'openaiLlm'],
] as const;

function Path({ parts }: { parts: string[] }) {
  return (
    <div className="path">
      {parts.map((p, i) => (
        <span key={p} className="contents">
          {i > 0 ? <i aria-hidden /> : null}
          <span>{p}</span>
        </span>
      ))}
    </div>
  );
}

export default async function SecurityPage() {
  const [t, home, locale] = await Promise.all([
    getTranslations('marketing.securityPage'),
    getTranslations('marketing.home.privacy'),
    requestLocale(),
  ]);
  const p = (k: string) => t(`plaintext.${k}` as 'plaintext.device');
  return (
    <>
      <div className="ink">
        <SiteHeader path="/security" />
        <section className="shero" aria-labelledby="t">
          <div className="wrap">
            <h1 className="h1" id="t">
              {t('titleA')} <br />
              {t('titleB')}
            </h1>
            <p className="lead">{t('lead')}</p>
            <PrivacyDiagram locale={locale} />
            <p className="cap">{home('caption')}</p>
          </div>
        </section>
      </div>

      <Doc toc={SECTIONS.map((id) => ({ id, label: t(`toc.${id}`) }))}>
        <section className="sec" id="stores" aria-labelledby="stores-t">
          <h2 className="h2" id="stores-t">
            {t('stores.title')}
          </h2>
          <p>{t('stores.body')}</p>
          <div className="two">
            <div className="yes">
              <h3>{t('stores.yes')}</h3>
              <ul>
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <li key={n}>{t(`stores.yes${n}`)}</li>
                ))}
              </ul>
            </div>
            <div className="no">
              <h3>{t('stores.no')}</h3>
              <ul>
                {([1, 2, 3, 4, 5] as const).map((n) => (
                  <li key={n}>{t(`stores.no${n}`)}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="sec" id="plaintext" aria-labelledby="plaintext-t">
          <h2 className="h2" id="plaintext-t">
            {t('plaintext.title')}
          </h2>
          <p>{t('plaintext.body')}</p>
          <div className="routes" data-component="DataFlowNote">
            <div className="route">
              <span className="n">{p('transcription')}</span>
              <div>
                <Path parts={[p('device'), 'AskCalls', 'ElevenLabs']} />
                <p>{p('transcriptionBody')}</p>
              </div>
            </div>
            <div className="route">
              <span className="n">{p('ask')}</span>
              <div>
                <Path parts={[p('device'), 'AskCalls', 'Anthropic']} />
                <p>{p('askBody')}</p>
              </div>
            </div>
            <div className="route">
              <span className="n">{p('translation')}</span>
              <div>
                <Path parts={[p('device'), 'AskCalls', 'Anthropic']} />
                <p>{p('translationBody')}</p>
              </div>
            </div>
            <div className="route">
              <span className="n">{p('inbox')}</span>
              <div>
                <Path parts={[p('remoteTool'), 'AskCalls', p('sealed')]} />
                <p>{p('inboxBody')}</p>
              </div>
            </div>
          </div>
          <h3>{p('retentionTitle')}</h3>
          <p>{p('retentionBody')}</p>
          <table className="tbl ret">
            <thead>
              <tr>
                <th scope="col">{p('provider')}</th>
                <th scope="col">{p('terms')}</th>
              </tr>
            </thead>
            <tbody>
              {RETENTION.map(([name, key]) => (
                <tr key={key}>
                  <td>{name}</td>
                  <td>{t.rich(`plaintext.${key}`, { code })}</td>
                </tr>
              ))}
              <tr>
                <td>{p('localName')}</td>
                <td>{p('local')}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="sec" id="keys" aria-labelledby="keys-t">
          <h2 className="h2" id="keys-t">
            {t('keys.title')}
          </h2>
          <p>{t('keys.body')}</p>
          <figure className="keys m-0" aria-label={t('keys.label')}>
            <div className="krow k4">
              <div className="kb">
                <b>{t('keys.passkey')}</b>
                <span>WebAuthn PRF</span>
              </div>
              <div className="kb">
                <b>{t('keys.recovery')}</b>
                <span>128-bit</span>
              </div>
              <div className="kb">
                <b>{t('keys.passphrase')}</b>
                <span>Argon2id</span>
              </div>
              <div className="kb">
                <b>{t('keys.linked')}</b>
                <span>ECDH P-256</span>
              </div>
            </div>
            <div className="kv">
              <span>{t('keys.each')}</span>
            </div>
            <div className="kb root">
              <b>{t('keys.root')}</b>
              <span>{t('keys.rootDetail')}</span>
            </div>
            <div className="kv">
              <span>HKDF-SHA256</span>
            </div>
            <div className="krow k2">
              <div className="kb">
                <b>kek</b>
                <span>AES-256-GCM</span>
              </div>
              <div className="kb">
                <b>index</b>
                <span>HMAC-SHA256</span>
              </div>
            </div>
            <div className="kv2" aria-hidden>
              <div />
              <div />
            </div>
            <div className="krow k2">
              <div className="kb">
                <b>{t('keys.perCall')}</b>
                <span>{t('keys.perCallDetail')}</span>
              </div>
              <div className="kb">
                <b>{t('keys.tokens')}</b>
                <span>{t('keys.tokensDetail')}</span>
              </div>
            </div>
          </figure>
        </section>

        <section className="sec" id="unlock" aria-labelledby="unlock-t">
          <h2 className="h2" id="unlock-t">
            {t('unlock.title')}
          </h2>
          <p>{t('unlock.body')}</p>
          <dl className="ul4">
            <div>
              <dt>{t('keys.passkey')}</dt>
              <dd>{t('unlock.passkey')}</dd>
            </div>
            <div>
              <dt>{t('keys.recovery')}</dt>
              <dd>{t('unlock.recovery')}</dd>
            </div>
            <div>
              <dt>{t('keys.passphrase')}</dt>
              <dd>{t('unlock.passphrase')}</dd>
            </div>
            <div>
              <dt>{t('unlock.locking')}</dt>
              <dd>{t('unlock.lockingBody')}</dd>
            </div>
          </dl>
        </section>

        <section className="sec" id="link" aria-labelledby="link-t">
          <h2 className="h2" id="link-t">
            {t('link.title')}
          </h2>
          <p>{t('link.body')}</p>
          <div className="link-fig" aria-hidden>
            <div className="ldev">
              <div className="fp">418 602</div>
              <div className="w">{t('link.newDevice')}</div>
            </div>
            <div className="eq">{t('link.compare')}</div>
            <div className="ldev">
              <div className="fp">418 602</div>
              <div className="w">{t('link.trusted')}</div>
            </div>
          </div>
          <ol className="steps">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <li key={n}>{t(`link.step${n}`)}</li>
            ))}
          </ol>
        </section>

        <section className="sec" id="verify" aria-labelledby="verify-t">
          <h2 className="h2" id="verify-t">
            {t('verify.title')}
          </h2>
          <p>{t('verify.body')}</p>
          <Term bar="~">
            <Cmd>curl -s https://askcalls.com/_next/static/chunks/[asset].js | shasum -a 256</Cmd>
            <Cmd>grep [asset].js SHA256SUMS</Cmd>
            <span className="dim"># the two hashes match</span>
          </Term>
        </section>

        <section className="sec" id="leak" aria-labelledby="leak-t">
          <h2 className="h2" id="leak-t">
            {t('leak.title')}
          </h2>
          <div className="big0">
            <b className="tab" aria-hidden>
              0
            </b>
            <p>
              <span className="sr-only">0 </span>
              {t('leak.zero')}
            </p>
          </div>
          <p>{t('leak.body')}</p>
          <div className="refs">
            <ArrowLink href={LEAK_TEST_URL}>{t('leak.link')}</ArrowLink>
          </div>
        </section>

        <section className="sec" id="report" aria-labelledby="report-t">
          <h2 className="h2" id="report-t">
            {t('report.title')}
          </h2>
          <p>{t('report.body')}</p>
          <div className="refs">
            <ArrowLink href={ADVISORY_URL}>{t('report.advisory')}</ArrowLink>
            <ArrowLink href="/subprocessors">{t('report.subprocessors')}</ArrowLink>
          </div>
        </section>
      </Doc>
      <SiteEnd />
    </>
  );
}
