import { DEFAULT_LIMITS } from '@askcalls/domain';
import { LimitsTable } from '@askcalls/ui/components/LimitsTable';
import { getTranslations } from 'next-intl/server';

/** The free-tier limits from the domain (spec 12), so the page can't drift from what's enforced. */
async function rows() {
  const t = await getTranslations('marketing.limits');
  const L = DEFAULT_LIMITS;
  return {
    label: t('label'),
    rows: [
      { key: 'calls', value: String(L.maxCalls), label: t('calls'), detail: t('callsDetail') },
      {
        key: 'minutes',
        value: String(L.transcriptionMinutesPerMonth),
        label: t('minutes'),
        detail: t('minutesDetail'),
      },
      {
        key: 'storage',
        value: String(L.recordingBytes / 1024 ** 3),
        unit: 'GB',
        label: t('storage'),
        detail: t('storageDetail'),
      },
      { key: 'asks', value: String(L.asksPerDay), label: t('asks'), detail: t('asksDetail') },
      {
        key: 'tokens',
        value: String(L.maxApiTokens),
        label: t('tokens'),
        detail: t('tokensDetail'),
      },
      {
        key: 'fetches',
        value: String(L.mcpFetchesPerTokenPerHour),
        label: t('fetches'),
        detail: t('fetchesDetail'),
      },
    ],
  };
}

export async function HomeLimits() {
  const { label, rows: r } = await rows();
  return (
    <LimitsTable
      label={label}
      limits={r.slice(0, 5).map(({ detail: _, ...l }) => l)}
      variant="teaser"
    />
  );
}

export async function LimitsSheet() {
  const { label, rows: r } = await rows();
  return <LimitsTable label={label} limits={r} variant="sheet" />;
}
