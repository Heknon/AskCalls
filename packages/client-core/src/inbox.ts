import { deleteInbox, listInbox } from '@askcalls/api-contract/routes/inbox';
import { listKeyring } from '@askcalls/api-contract/routes/keyring';
import { decryptInboxItem, joinEcies, openInboxPrivateKey } from '@askcalls/crypto';
import { DomainError } from '@askcalls/domain';
import { decodeInboxPayload } from '@askcalls/domain/use-cases/inbox';
import type { ClientContext } from './context';
import { type FailureReason, failureReason, IngestError } from './errors';
import { type IngestResult, ingestCall } from './ingest';

export interface InboxReport {
  processed: number;
  duplicates: number;
  failed: Array<{ id: string; reason: FailureReason }>;
}

/**
 * Inbox processing (spec 6.7, 11.2): on unlock, decrypt every item with the inbox private key,
 * run the full ingest with source `inbox`, and delete the item once its call exists (created or
 * a duplicate). Failed items stay until they expire, so a later unlock can retry them.
 */
export async function processInbox(ctx: ClientContext): Promise<InboxReport> {
  const report: InboxReport = { processed: 0, duplicates: 0, failed: [] };
  const { items } = await ctx.api.request(listInbox, {});
  if (items.length === 0) return report;

  const { userKeys } = await ctx.api.request(listKeyring, {});
  if (!userKeys) throw new DomainError('conflict', 'inbox keys are not set up');
  const { session } = ctx;
  const privateKey = await openInboxPrivateKey(
    session.keys.kek,
    session.userId,
    userKeys.inboxPrivateKeyCt,
  );

  for (const item of items) {
    let result: IngestResult;
    try {
      let envelope = item.payloadCt;
      if (!envelope) {
        if (!item.payloadUrl || !ctx.fetcher) {
          throw new IngestError('upload_failed', 'inbox payload is not reachable');
        }
        envelope = await ctx.fetcher.get({ url: item.payloadUrl });
      }
      const plain = await decryptInboxItem(
        privateKey,
        session.userId,
        joinEcies(item.ephemeralPublicKey, envelope),
      );
      const payload = decodeInboxPayload(plain);
      plain.fill(0);
      result = await ingestCall(ctx, {
        source: 'inbox',
        ...(payload.transcriptText !== null && { transcript: payload.transcriptText }),
        ...(payload.audio && { audio: payload.audio }),
        meta: {
          phone: payload.phone,
          startedAt: payload.startedAt,
          direction: payload.direction,
          contactName: payload.contactName,
        },
      });
    } catch (e) {
      result = { status: 'failed', reason: failureReason(e) };
    }
    if (result.status === 'failed') {
      report.failed.push({ id: item.id, reason: result.reason });
      continue;
    }
    await ctx.api.request(deleteInbox, { params: { id: item.id } });
    if (result.status === 'duplicate') report.duplicates++;
    else report.processed++;
  }
  return report;
}

/**
 * Runs `processInbox` in the background after every unlock (spec 11.2) and reports the counts,
 * e.g. for a toast. Returns the unsubscribe function.
 */
export function processInboxOnUnlock(
  ctx: ClientContext,
  onReport: (report: InboxReport) => void,
  onError: (reason: FailureReason) => void = () => {},
): () => void {
  return ctx.session.subscribe((e) => {
    if (e.type !== 'unlocked') return;
    processInbox(ctx).then(onReport, (err: unknown) => onError(failureReason(err)));
  });
}
