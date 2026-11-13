import { listCalls as listCallsRoute } from '@askcalls/api-contract/routes/calls';
import { utf8 } from '@askcalls/crypto';
import { strToU8, type Zippable, zipSync } from 'fflate';
import { type DecryptedCall, getCall, readRecording, transcriptFile } from './calls';
import type { ClientContext } from './context';

export const EXPORT_FORMAT_VERSION = 1;

export interface ExportOptions {
  includeRecordings?: boolean;
  onProgress?: (done: number) => void;
}

function tagLabel(t: DecryptedCall['tags'][number]): string {
  if (t.kind === 'star') return 'starred';
  if (t.kind === 'intent') return `intent:${t.intentId}`;
  return t.tag.name;
}

/**
 * Exports everything decrypted on the device as a ZIP (spec 11.2 Settings → Data):
 * `calls/<name>.json` (meta, transcript, tag names), `calls/<name>.srt`, `tags.json`,
 * `contacts.json` and, optionally, `recordings/<name>.opus`.
 */
export async function exportAll(ctx: ClientContext, opts: ExportOptions = {}): Promise<Uint8Array> {
  const files: Zippable = {};
  const [tags, contacts] = await Promise.all([
    ctx.userData.get('tags'),
    ctx.userData.get('contacts'),
  ]);
  files['tags.json'] = strToU8(JSON.stringify(tags.tags, null, 2));
  files['contacts.json'] = strToU8(JSON.stringify(contacts.contacts, null, 2));

  let cursor: string | null = null;
  let done = 0;
  const index: Array<{ id: string; file: string }> = [];
  do {
    const page: { items: Array<{ id: string }>; nextCursor: string | null } = await ctx.api.request(
      listCallsRoute,
      {
        query: { limit: 100, ...(cursor && { cursor }) },
      },
    );
    for (const row of page.items) {
      const call = await getCall(ctx, row.id);
      const srt = transcriptFile(call, 'srt');
      const name = srt.fileName.replace(/\.srt$/, '');
      files[`calls/${name}.json`] = strToU8(
        JSON.stringify(
          {
            id: call.id,
            source: call.source,
            meta: call.meta,
            tags: call.tags.map(tagLabel),
            transcript: call.transcript,
          },
          null,
          2,
        ),
      );
      files[`calls/${srt.fileName}`] = utf8(srt.content);
      if (opts.includeRecordings && call.recording) {
        files[`recordings/${name}.opus`] = [await readRecording(ctx, call), { level: 0 }];
      }
      index.push({ id: call.id, file: `calls/${name}.json` });
      opts.onProgress?.(++done);
    }
    cursor = page.nextCursor;
  } while (cursor);

  files['manifest.json'] = strToU8(
    JSON.stringify({
      v: EXPORT_FORMAT_VERSION,
      exportedAt: ctx.clock.now().toISOString(),
      calls: index,
    }),
  );
  return zipSync(files);
}
