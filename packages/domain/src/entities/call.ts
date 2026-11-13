import type { Bytes, CallId, Day, Token, UserId } from './common';

export type CallStatus = 'ready' | 'pending_inbox' | 'failed';
export type CallSource = 'app' | 'agent' | 'inbox';

/** 0: <1m, 1: 1–5m, 2: 5–15m, 3: 15–60m, 4: 60m+ */
export type DurationBucket = 0 | 1 | 2 | 3 | 4;

export function durationBucket(seconds: number): DurationBucket {
  if (seconds < 60) return 0;
  if (seconds < 300) return 1;
  if (seconds < 900) return 2;
  if (seconds < 3600) return 3;
  return 4;
}

/** Where an encrypted recording lives. `bucketRef` is null for the instance bucket. */
export interface RecordingRef {
  /** Null = instance BlobStore; otherwise an id from the user's encrypted provider settings. */
  bucketRef: string | null;
  objectKey: string;
  bytes: number;
}

export interface Call {
  id: CallId;
  userId: UserId;
  status: CallStatus;
  source: CallSource;
  day: Day;
  durationBucket: DurationBucket;
  wrappedDek: Bytes;
  transcriptCt: Bytes;
  metaCt: Bytes;
  contactTok: Token | null;
  keywordToks: Token[];
  tagToks: Token[];
  audioTok: Token | null;
  contentTok: Token;
  recording: RecordingRef | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewCall = Omit<Call, 'createdAt' | 'updatedAt'>;

export interface CallPatch {
  metaCt?: Bytes;
  tagToks?: Token[];
  recording?: RecordingRef | null;
}

/** The row shape returned for lists and search: everything needed to render, nothing more. */
export interface CallSummary {
  id: CallId;
  day: Day;
  durationBucket: DurationBucket;
  wrappedDek: Bytes;
  metaCt: Bytes;
  tagToks: Token[];
  hasRecording: boolean;
}

/** One embedded chunk of a call (spec 7.8–7.9). */
export interface CallChunk {
  callId: CallId;
  userId: UserId;
  ord: number;
  /** 384-dimension embedding of redacted text. */
  embedding: Float32Array;
  /** Redacted snippet encrypted with the call's DEK, AAD `userId‖callId‖snippet:<ord>`. */
  snippetCt: Bytes;
}

export interface CallListFilter {
  dayFrom?: Day;
  dayTo?: Day;
  /** All of these tag tokens required (AND). Starred = the user's `__star` tag token. */
  tagToks?: Token[];
}
