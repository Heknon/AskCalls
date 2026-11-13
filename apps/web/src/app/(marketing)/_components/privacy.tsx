import { TrustDiagram } from '@askcalls/ui/components/TrustDiagram';
import { getTranslations } from 'next-intl/server';
import { intlLocale, type Locale } from '../../../i18n/locales';
import data from '../_data/diagram.generated.json';
import { MARKETING_CALL } from '../_data/sample-call';

/** The first bytes of the envelope as the version byte and eleven 4-byte groups. */
function envelope(hex: string) {
  const groups = Array.from({ length: 11 }, (_, i) => hex.slice(2 + i * 8, 10 + i * 8));
  return { version: hex.slice(0, 2), groups };
}

/**
 * The boundary diagram with the sample call's real ciphertext and tokens
 * (`_data/diagram.generated.json`, checked by `diagram.test.ts`).
 */
export async function PrivacyDiagram({ locale }: { locale: Locale }) {
  const t = await getTranslations('marketing.home.privacy');
  const rec = data[locale];
  const call = MARKETING_CALL[locale];
  const { version, groups } = envelope(rec.transcriptCt);
  const bytes = new Intl.NumberFormat(intlLocale(locale)).format(rec.transcriptCt.length / 2);
  return (
    <TrustDiagram
      label={t('diagramLabel')}
      boundary={t('boundary')}
      device={{
        title: t('device'),
        items: [
          {
            field: 'transcript',
            value:
              locale === 'he'
                ? `„${call.segments[call.cited]!.text}”`
                : `“${call.segments[call.cited]!.text}”`,
          },
          {
            field: 'contact',
            value: (
              <>
                {call.contactName} · <bdi className="tab">{call.phone}</bdi>
              </>
            ),
          },
          { field: 'tag', value: call.tag },
          { field: 'when', value: t('when') },
        ],
      }}
      server={{
        title: t('server'),
        items: [
          {
            field: 'transcriptCt · AES-256-GCM',
            value: (
              <>
                {version} <span className="hl">{groups[0]}</span> {groups.slice(1).join(' ')} …{' '}
                {t('bytes', { count: bytes })}
              </>
            ),
          },
          { field: 'contactTok · HMAC-SHA256, 64 bit', value: rec.contactTok },
          { field: 'tagToks', value: `[${rec.tagToks.join(', ')}]` },
          { field: 'day · durationBucket', value: `${rec.day} · ${rec.durationBucket}` },
        ],
      }}
    />
  );
}
