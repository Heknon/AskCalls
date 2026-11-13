import {
  createCall,
  listCalls,
  recordingUpload,
  updateCall,
} from '@askcalls/api-contract/routes/calls';
import {
  contentToken,
  createDek,
  encryptRecording,
  sha256,
  signCall,
  toBase64Url,
  token,
  tokenSet,
} from '@askcalls/crypto';
import {
  type CallDirection,
  type CallMeta,
  type CallSource,
  dayFromDate,
  resolveLanguage,
  type Transcript,
  type TranscriptSegment,
  translationTargets,
} from '@askcalls/domain';
import {
  contentText,
  DEFAULT_PHONE_REGION,
  indexCall,
  isPhoneRegion,
  parseRules,
} from '@askcalls/indexing';
import { buildTranscript, parseTranscript } from '@askcalls/transcript-formats';
import { uuidv7 } from 'uuidv7';
import {
  encryptMeta,
  encryptSnippet,
  encryptTranscript,
  recordingAad,
  transcriptPlaintext,
} from './call-crypto';
import type { ClientContext } from './context';
import { duplicateOf, type FailureReason, failureReason, IngestError } from './errors';
import type { AudioSource, DecodedAudio } from './ports/index';
import { activeStoreRef } from './recording-stores/refs';
import { ensureTags, intentTagId } from './tags';
import { RECORDING_BITRATE_KBPS, transcribeAudio } from './transcription';

/** Per-file states of the bulk queue (spec 8). */
export type IngestStatus =
  | 'queued'
  | 'decoding'
  | 'transcribing'
  | 'translating'
  | 'indexing'
  | 'encrypting'
  | 'uploading'
  | 'done'
  | 'duplicate'
  | 'failed';

export type ActiveStatus = Exclude<IngestStatus, 'queued' | 'done' | 'duplicate' | 'failed'>;

export interface IngestMeta {
  /** Any format; parsed to E.164 with the settings' phone region. */
  phone?: string | null;
  startedAt?: string | Date | null;
  direction?: CallDirection | null;
  contactName?: string | null;
  title?: string | null;
  /** Tag names (from a manifest); missing ones are created in the catalog. */
  tags?: readonly string[];
}

export type TranscriptInput =
  | string
  | Uint8Array
  | { segments: TranscriptSegment[]; language?: string | null };

export interface IngestInput {
  source: CallSource;
  audio?: AudioSource;
  transcript?: TranscriptInput;
  /** For format detection and `meta.sourceFileName`. */
  transcriptFileName?: string;
  sourceFileName?: string;
  meta?: IngestMeta;
  backupRecording?: boolean;
  /** Overrides the settings' language hint for transcription. */
  language?: string;
}

export type IngestResult =
  | {
      status: 'done';
      callId: string;
      /** `failed` when the call was stored but the recording backup was not. */
      recording: 'none' | 'stored' | 'failed';
      /** `failed` when the call was stored but its vocabulary delta was not (fuzzy search misses it). */
      vocabulary: 'updated' | 'failed';
      /**
       * `none`: no translation rule covers its language. `failed`: a translation the rules ask
       * for could not be made (quota, provider error); "Apply to existing calls" picks it up
       * later. `off`: the rules ask for one but the AI provider is off.
       */
      translation: TranslationOutcome;
    }
  | { status: 'duplicate'; existingId: string; match: 'audio' | 'content' }
  | { status: 'failed'; reason: FailureReason };

export type TranslationOutcome = 'done' | 'none' | 'failed' | 'off';

/** Concurrency gates the bulk queue passes in; the defaults run immediately. */
export interface IngestGates {
  transcription<T>(fn: () => Promise<T>): Promise<T>;
  indexing<T>(fn: () => Promise<T>): Promise<T>;
}

const immediate: IngestGates = { transcription: (fn) => fn(), indexing: (fn) => fn() };

export interface IngestOptions {
  onStatus?: (status: ActiveStatus) => void;
  gates?: IngestGates;
}

function toTranscript(input: TranscriptInput, fileName?: string) {
  if (typeof input === 'string' || input instanceof Uint8Array) {
    try {
      const p = parseTranscript(input, { filename: fileName ?? null });
      return { transcript: p.transcript, language: p.language, format: p.format as string };
    } catch {
      throw new IngestError('transcript_unreadable', 'transcript could not be parsed');
    }
  }
  return {
    transcript: buildTranscript(input.segments),
    language: input.language ?? null,
    format: 'segments',
  };
}

const pcmBytes = (a: DecodedAudio) =>
  new Uint8Array(a.pcm.buffer, a.pcm.byteOffset, a.pcm.byteLength);

function isoOrNull(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * The ingest pipeline (spec 8), shared by single upload, bulk, the agent and the inbox. Never
 * throws: every outcome is a result, and failures carry a content-free reason.
 */
export async function ingestCall(
  ctx: ClientContext,
  input: IngestInput,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  try {
    return await runIngest(ctx, input, opts.onStatus ?? (() => {}), opts.gates ?? immediate);
  } catch (e) {
    const dup = duplicateOf(e);
    if (dup) return { status: 'duplicate', ...dup };
    return { status: 'failed', reason: failureReason(e) };
  }
}

async function findExisting(
  ctx: ClientContext,
  query: { audio_tok: bigint } | { content_tok: bigint },
): Promise<string | null> {
  const res = await ctx.api.request(listCalls, { query: { ...query, limit: 1 } });
  return res.items[0]?.id ?? null;
}

/** Audio token from decoded PCM, or from the file bytes when decoding fails (spec 6.4). */
async function fingerprintAudio(ctx: ClientContext, audio: AudioSource) {
  if (!ctx.audio) throw new IngestError('audio_unreadable', 'no audio codec on this device');
  const codec = ctx.audio;
  const decoded = await codec.decode(audio).catch(() => null);
  const bytes = decoded
    ? pcmBytes(decoded)
    : await codec.readBytes(audio).catch(() => {
        throw new IngestError('audio_unreadable', 'audio could not be read');
      });
  const audioTok = await token(ctx.session.keys.indexKey, 'a', await sha256(bytes));
  return { decoded, audioTok, existingId: await findExisting(ctx, { audio_tok: audioTok }) };
}

async function runIngest(
  ctx: ClientContext,
  input: IngestInput,
  onStatus: (s: ActiveStatus) => void,
  gates: IngestGates,
): Promise<IngestResult> {
  const { session } = ctx;
  if (!input.audio && input.transcript === undefined) {
    throw new IngestError('nothing_to_ingest', 'no audio or transcript');
  }
  const settings = await ctx.userData.get('settings');
  const region = isPhoneRegion(settings.phoneRegion) ? settings.phoneRegion : DEFAULT_PHONE_REGION;

  // 1. Audio fingerprint and duplicate check.
  let decoded: DecodedAudio | null = null;
  let audioTok: bigint | null = null;
  if (input.audio) {
    onStatus('decoding');
    const fp = await gates.indexing(() => fingerprintAudio(ctx, input.audio!));
    decoded = fp.decoded;
    audioTok = fp.audioTok;
    if (fp.existingId) return { status: 'duplicate', existingId: fp.existingId, match: 'audio' };
  }

  // 2. Transcript: parse, or transcribe the audio.
  let parsed: { transcript: Transcript; language: string | null; format: string };
  if (input.transcript !== undefined) {
    parsed = toTranscript(input.transcript, input.transcriptFileName);
  } else {
    const audio = decoded;
    if (!audio) throw new IngestError('audio_unreadable', 'audio could not be decoded');
    if (!ctx.transcriber || !ctx.audio) {
      throw new IngestError('transcription_unavailable', 'transcription is off');
    }
    const { audio: codec, transcriber } = ctx;
    onStatus('transcribing');
    const result = await gates.transcription(() =>
      transcribeAudio(codec, transcriber, audio, input.language ?? settings.language).catch((e) => {
        if (failureReason(e) === 'quota_exceeded') throw e;
        throw new IngestError('transcription_failed', 'transcription failed');
      }),
    );
    parsed = {
      transcript: buildTranscript(result.segments),
      language: result.language,
      format: `transcriber:${transcriber.id}`,
    };
  }
  const { transcript } = parsed;
  if (transcript.segments.length === 0 || transcript.text.trim() === '') {
    throw new IngestError('transcript_empty', 'transcript has no text');
  }

  // 3. Content token and duplicate check, before anything is sent for translation.
  const language = resolveLanguage(parsed.language, transcript.text);
  const dup = await gates.indexing(async () => {
    const contentTok = await contentToken(session.keys.indexKey, contentText(transcript.text));
    return { contentTok, existing: await findExisting(ctx, { content_tok: contentTok }) };
  });
  if (dup.existing) return { status: 'duplicate', existingId: dup.existing, match: 'content' };
  const { contentTok } = dup;

  // 3a. Translation by the user's rules (in transit only, through the Ask provider).
  const providers = await ctx.userData.get('providers');
  const targets = translationTargets(language, providers.translation.rules);
  let full: Transcript = transcript;
  let translation: TranslationOutcome = targets.length ? 'done' : 'none';
  if (targets.length) {
    const translator = ctx.translator;
    if (!translator || !(await (translator.enabled?.() ?? true))) {
      translation = 'off';
    } else {
      onStatus('translating');
      // Loaded only when a rule asks for a translation.
      const { translateTranscript } = await import('./translation');
      full = await gates.transcription(() =>
        translateTranscript(translator, transcript, language, targets, {
          clock: ctx.clock,
          onError: () => {
            translation = 'failed';
          },
        }),
      );
    }
  }
  const translatedTo = Object.keys(full.translations ?? {}).sort();

  return gates.indexing(async () => {
    // 4. Index (spec 7).
    const [contacts, synonyms, rules] = await Promise.all([
      ctx.userData.get('contacts'),
      ctx.userData.get('synonyms'),
      ctx.userData.get('rules'),
    ]);
    const meta = input.meta ?? {};
    const intents = await ctx.intents.get(settings.customIntents);
    const decodedAudio = decoded;
    onStatus('indexing');
    const indexed = await indexCall({
      transcript: full,
      language,
      meta: {
        phone: meta.phone ?? null,
        contactName: meta.contactName ?? null,
        direction: meta.direction ?? 'unknown',
        durationSec: decodedAudio?.durationSec ?? null,
      },
      contacts: contacts.contacts,
      synonyms: synonyms.entries,
      intents,
      intentThreshold: settings.intentThreshold,
      rules: parseRules(rules.rules),
      embed: (texts) => ctx.embedder.embed(texts),
      region,
    });
    const manifestTagIds = await ensureTags(ctx.userData, meta.tags ?? []);
    const tagIds = [...indexed.tagIds, ...indexed.intentIds.map(intentTagId), ...manifestTagIds];

    // 5. Keys, tokens and ciphertext.
    onStatus('encrypting');
    const { userId } = session;
    const callId = uuidv7();
    const keyCtx = { userId, callId };
    const { dek, wrappedDek } = await createDek(session.keys.kek, keyCtx);
    const plaintext = transcriptPlaintext(full);
    const device = session.device;
    const signature = device
      ? {
          deviceKeyId: device.deviceKeyId,
          signature: toBase64Url(
            await signCall(device.privateKey, {
              callId,
              contentTok,
              transcriptPlaintext: plaintext,
            }),
          ),
        }
      : null;
    const startedAt = isoOrNull(meta.startedAt);
    const callMeta: CallMeta = {
      phoneE164: indexed.contactE164,
      contactName: indexed.contactName,
      direction: indexed.direction,
      startedAt,
      durationSec: indexed.durationSec,
      title: meta.title ?? null,
      notes: null,
      sourceFileName: input.sourceFileName ?? input.transcriptFileName ?? null,
      language,
      signature,
      segmentsFormat: parsed.format,
      translatedTo,
    };
    const index = session.keys.indexKey;
    const [transcriptCt, metaCt, chunks, keywordToks, tagToks, contactTok] = await Promise.all([
      encryptTranscript(dek, keyCtx, plaintext),
      encryptMeta(dek, keyCtx, callMeta),
      Promise.all(
        indexed.chunks.map(async (c) => ({
          ord: c.ord,
          lang: c.lang,
          embedding: c.embedding,
          snippetCt: await encryptSnippet(dek, keyCtx, c.ord, c.snippet),
        })),
      ),
      tokenSet(index, 'w', indexed.keywords),
      tokenSet(index, 't', tagIds),
      indexed.contactE164 ? token(index, 'c', indexed.contactE164) : Promise.resolve(null),
    ]);
    plaintext.fill(0);

    // 6. Upload.
    onStatus('uploading');
    await ctx.api.request(createCall, {
      body: {
        id: callId,
        source: input.source,
        day: dayFromDate(startedAt ? new Date(startedAt) : ctx.clock.now()),
        durationBucket: indexed.durationBucket ?? 0,
        wrappedDek,
        transcriptCt,
        metaCt,
        contactTok,
        keywordToks,
        tagToks,
        audioTok,
        contentTok,
        chunks,
      },
    });

    // 7. Optional recording backup.
    let recording: 'none' | 'stored' | 'failed' = 'none';
    if (input.backupRecording && decodedAudio) {
      recording = await backupRecording(ctx, keyCtx, dek, decodedAudio).then(
        (stored) => (stored ? ('stored' as const) : ('none' as const)),
        () => 'failed' as const,
      );
    }

    // 8. Vocabulary delta.
    const vocabulary = await ctx.vocabulary.append(indexed.vocabularyDelta).then(
      () => 'updated' as const,
      () => 'failed' as const,
    );
    return { status: 'done', callId, recording, vocabulary, translation };
  });
}

async function backupRecording(
  ctx: ClientContext,
  keyCtx: { userId: string; callId: string },
  dek: CryptoKey,
  audio: DecodedAudio,
): Promise<boolean> {
  const providers = await ctx.userData.get('providers');
  if (providers.recordings.mode === 'off') return false;
  if (!ctx.audio) throw new IngestError('audio_unreadable', 'no audio codec on this device');
  const encoded = await ctx.audio.encodeOpus(audio, { bitrateKbps: RECORDING_BITRATE_KBPS });
  const ct = await encryptRecording(dek, encoded.bytes, recordingAad(keyCtx));
  const bucketRef = activeStoreRef(providers);
  if (bucketRef) {
    if (!ctx.ownStores) throw new IngestError('upload_failed', 'no own-store adapter');
    const { objectKey } = await ctx.ownStores.put(bucketRef, keyCtx.callId, ct);
    await ctx.api.request(updateCall, {
      params: { id: keyCtx.callId },
      body: { recording: { bucketRef, objectKey, bytes: ct.length } },
    });
    return true;
  }
  if (!ctx.uploader) throw new IngestError('upload_failed', 'no recording uploader');
  const presigned = await ctx.api.request(recordingUpload, {
    params: { id: keyCtx.callId },
    body: { bytes: ct.length, contentType: 'application/octet-stream' },
  });
  await ctx.uploader.put(presigned, ct);
  await ctx.api.request(updateCall, {
    params: { id: keyCtx.callId },
    body: { recording: { bucketRef: null, objectKey: presigned.objectKey, bytes: ct.length } },
  });
  return true;
}
