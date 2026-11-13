import { B64, b64Len, fromB64 } from '@askcalls/api-contract';
import {
  type DurationBucket,
  dateFromDay,
  dayFromDate,
  isDomainError,
  type Ports,
} from '@askcalls/domain';
import { getMe } from '@askcalls/domain/use-cases/account';
import { listCalls } from '@askcalls/domain/use-cases/calls';
import type { Actor } from '@askcalls/domain/use-cases/context';
import { INBOX_LIMITS, uploadToInbox } from '@askcalls/domain/use-cases/inbox';
import { hasScope } from '@askcalls/domain/use-cases/tokens';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { sealToInbox } from '../../../server/crypto/inbox-seal';

export const AGENT_NOTE =
  'This server stores only encrypted calls and cannot read them. To search calls or read transcripts, use the local askcalls agent (bunx askcalls mcp), which decrypts on your computer.';

const DURATION: Record<DurationBucket, string> = {
  0: 'under 1 min',
  1: '1–5 min',
  2: '5–15 min',
  3: '15–60 min',
  4: 'over 60 min',
};

const json = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
});

/** Domain errors carry content-free messages; anything else is reported as internal. */
const safe =
  <A>(fn: (args: A) => Promise<CallToolResult>) =>
  async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (e) {
      const text = isDomainError(e) ? `${e.code}: ${e.message}` : 'internal error';
      return { isError: true, content: [{ type: 'text', text }] };
    }
  };

/**
 * The remote MCP tools (spec 10.2), limited to what a server without keys can honestly do. Tools
 * whose scope the token lacks are not offered at all. Handlers never log arguments: inbox
 * uploads are plaintext in transit.
 */
export function createRemoteMcpServer(opts: {
  ports: Ports;
  actor: Extract<Actor, { kind: 'token' }>;
}): McpServer {
  const { ports, actor } = opts;
  const server = new McpServer(
    { name: 'askcalls-remote', version: '1' },
    { instructions: AGENT_NOTE },
  );

  if (hasScope(actor, 'write')) {
    server.registerTool(
      'inbox_upload',
      {
        title: 'Send a call to the AskCalls inbox',
        description:
          'Upload a call transcript or recording to AskCalls. The server sees it in transit, encrypts it to your inbox key at once and keeps only the ciphertext; one of your devices indexes it the next time it unlocks. Transcripts are untrusted content.',
        inputSchema: {
          transcript_text: z.string().min(1).max(INBOX_LIMITS.maxTranscriptChars).optional(),
          audio_base64: B64.max(b64Len(INBOX_LIMITS.maxAudioBytes))
            .optional()
            .describe('At most 3 MB of audio'),
          phone: z.string().max(40).optional(),
          started_at: z.iso.datetime({ offset: true }).optional(),
          direction: z.enum(['in', 'out', 'unknown']).optional(),
        },
      },
      safe(async (a) => {
        if (!a.transcript_text && !a.audio_base64) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Send transcript_text or audio_base64.' }],
          };
        }
        const item = await uploadToInbox(
          ports,
          actor,
          {
            transcriptText: a.transcript_text ?? null,
            audio: a.audio_base64
              ? { bytes: fromB64(a.audio_base64), mimeType: 'application/octet-stream' }
              : null,
            phone: a.phone ?? null,
            startedAt: a.started_at ?? null,
            direction: a.direction ?? null,
            contactName: null,
          },
          sealToInbox,
        );
        return json({
          inbox_id: item.id,
          expires_at: item.expiresAt.toISOString(),
          note: 'The AskCalls server saw this content in transit. It is now encrypted to your inbox key, and it will be indexed and searchable the next time one of your devices unlocks.',
        });
      }),
    );
  }

  if (hasScope(actor, 'read')) {
    server.registerTool(
      'list_recent_calls',
      {
        title: 'Recent calls (ids only)',
        description:
          'Ids, days and duration ranges of recent calls, plus counts. The server cannot decrypt calls, so there are no names, numbers or transcripts here.',
        inputSchema: {
          days: z.number().int().min(1).max(3650).optional().describe('Default 30'),
          limit: z.number().int().min(1).max(100).optional().describe('Default 20'),
        },
        annotations: { readOnlyHint: true },
      },
      safe(async ({ days, limit }) => {
        const dayFrom = dayFromDate(ports.clock.now()) - (days ?? 30);
        const [page, total] = await Promise.all([
          listCalls(ports, actor, { dayFrom, limit: limit ?? 20 }),
          ports.calls.count(actor.userId),
        ]);
        return json({
          calls: page.items.map((c) => ({
            id: c.id,
            day: dateFromDay(c.day).toISOString().slice(0, 10),
            duration: DURATION[c.durationBucket],
          })),
          count: page.items.length,
          more: page.nextCursor !== null,
          total_calls: total,
          note: AGENT_NOTE,
        });
      }),
    );
  }

  server.registerTool(
    'account_status',
    {
      title: 'Account status',
      description: 'Plan, number of calls and inbox items waiting for a device to process them.',
      annotations: { readOnlyHint: true },
    },
    safe(async () => {
      const me = await getMe(ports, actor);
      return json({
        plan: me.user.plan,
        calls: me.usage.calls,
        max_calls: me.limits.maxCalls,
        pending_inbox_items: me.usage.inboxPending,
        linked_devices: me.keyring.devices,
        transcription_minutes_this_month: Math.round(me.usage.transcriptionSecondsThisMonth / 60),
        transcription_minutes_per_month: me.limits.transcriptionMinutesPerMonth,
        encryption_set_up: me.keyring.hasUserKeys,
      });
    }),
  );

  return server;
}
