import { fromB64 } from '@askcalls/api-contract';
import { listInbox, uploadInbox } from '@askcalls/api-contract/routes/inbox';
import { listInbox as list, uploadToInbox } from '@askcalls/domain/use-cases/inbox';
import { sealToInbox } from '../../../server/crypto/inbox-seal';
import { route } from '../../../server/http/handler';

/**
 * Spec 6.7. The body is plaintext, seen in transit only: sealed to the user's inbox public key
 * in memory, then dropped. Never written to disk or blobs unencrypted, never logged.
 */
export const POST = route(
  uploadInbox,
  async ({ ports, actor, body }) => {
    const item = await uploadToInbox(
      ports,
      actor,
      {
        transcriptText: body.transcriptText ?? null,
        audio: body.audioBase64
          ? {
              bytes: fromB64(body.audioBase64),
              mimeType: body.audioMimeType ?? 'application/octet-stream',
            }
          : null,
        phone: body.phone ?? null,
        startedAt: body.startedAt ?? null,
        direction: body.direction ?? null,
        contactName: body.contactName ?? null,
      },
      sealToInbox,
    );
    return { ...item, visibleInTransit: true as const };
  },
  {
    maxBodyBytes: 4 * 1024 * 1024 + 64 * 1024,
    rateLimit: { name: 'inbox', limit: 60, windowMs: 60_000 },
  },
);

export const GET = route(listInbox, async ({ ports, actor }) => ({
  items: await list(ports, actor),
}));
