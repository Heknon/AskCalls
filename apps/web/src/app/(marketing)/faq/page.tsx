import { FaqList } from '@askcalls/ui/components/FaqList';
import { getTranslations } from 'next-intl/server';
import { type FaqKey, faqItems } from '../_components/faq';
import { meta } from '../_components/meta';
import { PageHero, SiteEnd } from '../_components/site';

export const generateMetadata = meta('faq', '/faq');

const GROUPS: { title: 'groupStart' | 'groupPrivacy' | 'groupLimits'; keys: FaqKey[] }[] = [
  { title: 'groupStart', keys: ['legal', 'hebrew', 'providers', 'selfHost', 'open'] },
  { title: 'groupPrivacy', keys: ['staff', 'lost', 'where', 'remote', 'delete'] },
  { title: 'groupLimits', keys: ['limit', 'ownKeys', 'selfHostFree'] },
];

export default async function FaqPage() {
  const t = await getTranslations('marketing.faqPage');
  const groups = await Promise.all(
    GROUPS.map(async (g) => ({ ...g, items: await faqItems(g.keys) })),
  );
  return (
    <>
      <PageHero path="/faq" title={t('titleA')} lead={t('lead')} />
      <main id="main">
        {groups.map((g, i) => (
          <section
            key={g.title}
            className={i === 0 ? 'ch ch-first' : 'ch ch-tight'}
            aria-labelledby={`g-${g.title}`}
          >
            <div className="wrap faq-g">
              <h2 className="h2" id={`g-${g.title}`}>
                {t(g.title)}
              </h2>
              <FaqList items={g.items} />
            </div>
          </section>
        ))}
      </main>
      <SiteEnd />
    </>
  );
}
