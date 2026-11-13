import { z } from 'zod';
import { defineRoute } from '../route';
import { DateCodec } from '../wire';
import { KeyringEntrySummarySchema } from './keyring';

export const MeSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().nullable(),
    name: z.string().nullable(),
    image: z.string().nullable(),
    plan: z.enum(['free', 'pro']),
    role: z.enum(['user', 'admin']),
    locale: z.string().nullable(),
    createdAt: DateCodec,
  }),
  telemetryConsent: z.object({ productEvents: z.boolean(), errorReports: z.boolean() }),
  retentionDays: z.number().int().nullable(),
  limits: z.object({
    maxCalls: z.number().int(),
    transcriptionMinutesPerMonth: z.number().int(),
    recordingBytes: z.number().int(),
    maxApiTokens: z.number().int(),
    mcpFetchesPerTokenPerHour: z.number().int(),
    asksPerDay: z.number().int(),
    translationCharsPerMonth: z.number().int(),
  }),
  usage: z.object({
    calls: z.number().int(),
    recordingBytes: z.number().int(),
    transcriptionSecondsThisMonth: z.number(),
    asksToday: z.number().int(),
    translationCharsThisMonth: z.number().int(),
    apiTokens: z.number().int(),
    inboxPending: z.number().int(),
  }),
  keyring: z.object({
    entries: z.array(KeyringEntrySummarySchema),
    hasUserKeys: z.boolean(),
    keyVersion: z.number().int().nullable(),
    devices: z.number().int(),
  }),
  features: z.object({
    transcription: z.object({
      enabled: z.boolean(),
      provider: z.string().nullable(),
      directTokens: z.boolean(),
    }),
    llm: z.object({
      enabled: z.boolean(),
      provider: z.string().nullable(),
      model: z.string().nullable(),
    }),
    translation: z.object({ enabled: z.boolean() }),
  }),
});

export const getMe = defineRoute({
  method: 'GET',
  path: '/api/me',
  auth: 'session',
  response: MeSchema,
});

/**
 * Crypto-shred: deletes every row and instance-bucket blob, then signs out. Recordings in the
 * user's own buckets are listed for the device to delete with its own credentials.
 */
export const deleteAccount = defineRoute({
  method: 'DELETE',
  path: '/api/account',
  auth: 'session',
  body: z.object({ confirm: z.literal('delete my account') }),
  response: z.object({
    deleted: z.literal(true),
    ownBucketRecordings: z.array(z.object({ bucketRef: z.string(), objectKey: z.string() })),
  }),
});
