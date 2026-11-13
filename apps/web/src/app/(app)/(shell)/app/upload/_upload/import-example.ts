import { EXAMPLE_MANIFEST } from '@askcalls/client-core/bulk/format-guide';
import { MANIFEST_NAME } from '@askcalls/client-core/bulk/pairing';

export { EXAMPLE_MANIFEST, EXAMPLE_TREE } from '@askcalls/client-core/bulk/format-guide';
export { MANIFEST_COLUMNS } from '@askcalls/client-core/bulk/manifest';

/** Saves the example manifest.csv. */
export function downloadExampleManifest() {
  const url = URL.createObjectURL(
    new Blob([`${EXAMPLE_MANIFEST}\n`], { type: 'text/csv;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = MANIFEST_NAME;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
