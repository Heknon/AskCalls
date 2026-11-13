'use client';

import { ImportFormatGuide } from '@askcalls/ui/components/ImportFormatGuide';
import { useTranslations } from 'next-intl';
import {
  downloadExampleManifest,
  EXAMPLE_MANIFEST,
  EXAMPLE_TREE,
  MANIFEST_COLUMNS,
} from './import-example';

/** The example folder and manifest.csv, under the drop zone. */
export function Guide() {
  const t = useTranslations('upload.bulk.guide');
  const tc = useTranslations('common');
  return (
    <ImportFormatGuide
      title={t('title')}
      pairing={t('pairing')}
      tree={EXAMPLE_TREE}
      manifest={t('manifest')}
      csv={EXAMPLE_MANIFEST}
      columns={MANIFEST_COLUMNS.map((name) => ({ name, note: t(`col.${name}`) }))}
      labels={{ copy: tc('copy'), copied: tc('copied'), download: t('download') }}
      onDownload={downloadExampleManifest}
    />
  );
}
