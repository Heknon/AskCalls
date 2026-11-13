import { UseCaseCard } from '@askcalls/ui/components/UseCaseCard';
import { getTranslations } from 'next-intl/server';

export async function UseCases() {
  const t = await getTranslations('marketing.home.uses');
  return (
    <ul className="qs">
      {(['sales', 'disputes', 'records', 'coaching'] as const).map((k) => (
        <UseCaseCard
          key={k}
          query={t(`${k}.query`)}
          role={t(`${k}.role`)}
          result={t(`${k}.result`)}
        />
      ))}
    </ul>
  );
}
