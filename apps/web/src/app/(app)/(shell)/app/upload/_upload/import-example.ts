import { MANIFEST_NAME } from '@askcalls/client-core/bulk/pairing';

/** The example folder of the bulk import guide: sample data in the format, not UI copy. */
export const EXAMPLE_TREE = [
  'calls/',
  `├─ ${MANIFEST_NAME}`,
  '├─ 2026-03-01 Dana.mp3',
  '├─ 2026-03-01 Dana.txt',
  '├─ 2026-03-02 Ron.m4a',
  '├─ 2026-03-02 Ron.transcript.json',
  '└─ clinic/',
  '   └─ 2026-03-05 Front desk.wav',
].join('\n');

export const EXAMPLE_MANIFEST = [
  'file,phone,started_at,direction,contact_name,tags',
  '2026-03-01 Dana.mp3,+972501234567,2026-03-01T14:05:00+02:00,in,Dana Levi,supplier;fridges',
  '2026-03-02 Ron.m4a,+972527654321,2026-03-02 07:30,out,Ron Cohen,legal',
  'clinic/2026-03-05 Front desk.wav,+97235550134,2026-03-05 09:00,in,,clinic',
].join('\n');

export const MANIFEST_COLUMNS = [
  'file',
  'phone',
  'started_at',
  'direction',
  'contact_name',
  'tags',
] as const;

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
