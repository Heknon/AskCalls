import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { MarketingPath } from '../_data/routes';
import { Doc, PageHero, SiteEnd } from './site';

const SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'] as const;

/** A legal template: the Draft notice in the hero, numbered sections in the reading column. */
export async function LegalPage({
  doc,
  path,
  children,
}: {
  doc: 'privacy' | 'terms' | 'dpa' | 'subprocessors';
  path: MarketingPath;
  children?: ReactNode;
}) {
  const [t, c, l] = await Promise.all([
    getTranslations(`marketing.legal.${doc}` as 'marketing.legal.privacy'),
    getTranslations('marketing.common'),
    getTranslations('marketing.legal'),
  ]);
  const sections =
    doc === 'subprocessors'
      ? []
      : SECTIONS.filter((s) => t.has(`${s}t`)).map((s) => ({
          id: s,
          title: t(`${s}t` as 's1t'),
          body: t(s),
        }));
  return (
    <>
      <PageHero path={path} title={t('title')} lead={t('lead')}>
        <p className="draft" role="note">
          <i aria-hidden />
          {c('draft')}
        </p>
      </PageHero>
      <Doc
        className={`legal ${sections.length ? '' : 'solo'}`}
        toc={sections.map((s) => ({ id: s.id, label: s.title }))}
      >
        {sections.map((s) => (
          <section key={s.id} className="sec" id={s.id} aria-labelledby={`${s.id}-t`}>
            <h2 className="h2" id={`${s.id}-t`}>
              {s.title}
            </h2>
            <p>{s.body}</p>
          </section>
        ))}
        {children}
        <section className="sec">
          <p>{c('updated')}</p>
          <p>{l('contact')}</p>
        </section>
      </Doc>
      <SiteEnd />
    </>
  );
}
