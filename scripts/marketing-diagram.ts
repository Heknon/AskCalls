/**
 * Encrypts the marketing sample call (English and Hebrew) the way ingest does, under fresh demo
 * keys, and writes what the server would store to the privacy diagram's data file. The diagram
 * test decrypts the file with the published demo keys, so the bytes on the page stay real.
 *
 *   bun scripts/marketing-diagram.ts
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encryptSampleCall } from '../apps/web/src/app/(marketing)/_data/diagram';
import { MARKETING_CALL } from '../apps/web/src/app/(marketing)/_data/sample-call';

const out = join(
  import.meta.dir,
  '..',
  'apps/web/src/app/(marketing)/_data/diagram.generated.json',
);
const data = {
  en: await encryptSampleCall(MARKETING_CALL.en),
  he: await encryptSampleCall(MARKETING_CALL.he),
};
await writeFile(out, `${JSON.stringify(data, null, 2)}\n`);
console.log(`wrote ${out}`);
