import { ApiError } from '@askcalls/api-contract';
import { replaceCallContent } from '@askcalls/api-contract/routes/calls';
import { signCall, toBase64Url, tokenSet } from '@askcalls/crypto';
import {
  type CallMeta,
  normalizeLanguage,
  resolveLanguage,
  type Transcript,
  type TranslationRule,
  translationTargets,
} from '@askcalls/domain';
import {
  analyzeCall,
  DEFAULT_PHONE_REGION,
  indexCall,
  isPhoneRegion,
  type Vocabulary,
} from '@askcalls/indexing';
import { encryptMeta, encryptSnippet, encryptTranscript, transcriptPlaintext } from './call-crypto';
import { type DecryptedCall, getCall, listCalls } from './calls';
import type { ClientContext } from './context';
import { translateTranscript, translationPlan, withoutTranslations } from './translation';

/**
 * Re-indexing (translation backfill, synonym changes): the device decrypts a call, re-derives
 * everything search needs from the transcript, re-signs it and replaces it in one request
 * (`PUT /api/calls/:id/content`). Tags, the recording and the content token stay as they are.
 */

export type ReindexOutcome =
  /** Re-indexed, with every translation the call needs. */
  | 'reindexed'
  /** Re-indexed, but a translation could not be made (quota, provider, translation off). */
  | 'untranslated'
  /** Nothing to do: the call already has its translations. */
  | 'skipped';

export interface ReindexOptions {
  /** Add missing translations first. False re-indexes with what the transcript already has. */
  translate: boolean;
  signal?: AbortSignal;
}

/** Counts per language, added, minus counts removed: one vocabulary delta. */
function vocabularyDiff(next: Vocabulary, prev: Vocabulary): Vocabulary {
  const out: Vocabulary = new Map(next);
  for (const [k, n] of prev) out.set(k, (out.get(k) ?? 0) - n);
  for (const [k, n] of out) if (n === 0) out.delete(k);
  return out;
}

/**
 * True when the list row's metadata shows the call's translations differ from what the rules
 * ask: one missing, or one no rule covers any more. Calls stored before translations count when
 * a rule covers their language (or their language is unknown).
 */
export function needsTranslation(
  meta: Pick<CallMeta, 'language' | 'translatedTo'>,
  rules: readonly TranslationRule[],
): boolean {
  const language = normalizeLanguage(meta.language);
  const want = translationTargets(language, rules);
  if (!meta.translatedTo) return want.length > 0 || (language === null && rules.length > 0);
  const have = new Set(meta.translatedTo);
  return want.length !== have.size || want.some((l) => !have.has(l));
}

async function reindexOnce(
  ctx: ClientContext,
  call: DecryptedCall,
  opts: ReindexOptions,
): Promise<ReindexOutcome> {
  const { session } = ctx;
  const language = resolveLanguage(call.meta.language, call.transcript.text);
  let transcript: Transcript = call.transcript;
  let outcome: ReindexOutcome = 'reindexed';
  if (opts.translate) {
    const { translation } = await ctx.userData.get('providers');
    const plan = translationPlan(transcript, language, translation.rules);
    if (
      !plan.missing.length &&
      !plan.extra.length &&
      call.meta.translatedTo &&
      call.meta.language === language
    ) {
      return 'skipped';
    }
    transcript = withoutTranslations(transcript, plan.extra);
    if (plan.missing.length) {
      const translator = ctx.translator;
      if (!translator || !(await (translator.enabled?.() ?? true))) {
        outcome = 'untranslated';
      } else {
        transcript = await translateTranscript(translator, transcript, language, plan.missing, {
          clock: ctx.clock,
          ...(opts.signal && { signal: opts.signal }),
          onError: () => {
            outcome = 'untranslated';
          },
        });
      }
    }
  }
  opts.signal?.throwIfAborted();
  if (outcome === 'untranslated' && transcript === call.transcript) return outcome;

  const [settings, contacts, synonyms] = await Promise.all([
    ctx.userData.get('settings'),
    ctx.userData.get('contacts'),
    ctx.userData.get('synonyms'),
  ]);
  const region = isPhoneRegion(settings.phoneRegion) ? settings.phoneRegion : DEFAULT_PHONE_REGION;
  const intents = await ctx.intents.get(settings.customIntents);
  const indexed = await indexCall({
    transcript,
    language,
    meta: {
      phone: call.meta.phoneE164,
      contactName: call.meta.contactName,
      direction: call.meta.direction,
      durationSec: call.meta.durationSec,
    },
    contacts: contacts.contacts,
    synonyms: synonyms.entries,
    intents,
    intentThreshold: settings.intentThreshold,
    embed: (texts) => ctx.embedder.embed(texts),
    region,
  });
  const before = analyzeCall({
    transcript: call.transcript,
    language: call.meta.language,
    meta: { phone: call.meta.phoneE164 },
    synonyms: synonyms.entries,
    region,
  });

  const keyCtx = { userId: session.userId, callId: call.id };
  const plaintext = transcriptPlaintext(transcript);
  const device = session.device;
  const signature = device
    ? {
        deviceKeyId: device.deviceKeyId,
        signature: toBase64Url(
          await signCall(device.privateKey, {
            callId: call.id,
            contentTok: call.contentTok,
            transcriptPlaintext: plaintext,
          }),
        ),
      }
    : null;
  const meta: CallMeta = {
    ...call.meta,
    language,
    signature,
    translatedTo: Object.keys(transcript.translations ?? {}).sort(),
  };
  const [transcriptCt, metaCt, chunks, keywordToks] = await Promise.all([
    encryptTranscript(call.dek, keyCtx, plaintext),
    encryptMeta(call.dek, keyCtx, meta),
    Promise.all(
      indexed.chunks.map(async (c) => ({
        ord: c.ord,
        lang: c.lang,
        embedding: c.embedding,
        snippetCt: await encryptSnippet(call.dek, keyCtx, c.ord, c.snippet),
      })),
    ),
    tokenSet(session.keys.indexKey, 'w', indexed.keywords),
  ]);
  plaintext.fill(0);
  await ctx.api.request(replaceCallContent, {
    params: { id: call.id },
    body: { transcriptCt, metaCt, keywordToks, chunks, expectedUpdatedAt: call.updatedAt },
  });
  await ctx.vocabulary
    .append(vocabularyDiff(indexed.vocabularyDelta, before.vocabularyDelta))
    .catch(() => {});
  session.touch();
  return outcome;
}

/**
 * Re-indexes one call. A concurrent change to the call (a note, a tag, another device's
 * re-index) is a version conflict: the call is read again and re-indexed once more.
 */
export async function reindexCall(
  ctx: ClientContext,
  id: string,
  opts: ReindexOptions,
): Promise<ReindexOutcome> {
  for (let attempt = 0; ; attempt++) {
    const call = await getCall(ctx, id);
    try {
      return await reindexOnce(ctx, call, opts);
    } catch (e) {
      if (attempt === 0 && e instanceof ApiError && e.code === 'version_conflict') continue;
      throw e;
    }
  }
}

export interface ReindexProgress {
  /** Calls looked at so far, out of `total` (known once the list is read). */
  done: number;
  total: number;
  reindexed: number;
  untranslated: number;
  failed: number;
}

export interface ReindexRunOptions {
  /** `translate`: only calls missing a translation. `all`: every call (synonym changes). */
  mode: 'translate' | 'all';
  onProgress?: (p: ReindexProgress) => void;
  signal?: AbortSignal;
  /** Calls re-indexed at the same time. Default 2. */
  concurrency?: number;
}

/** The ids a run would touch: from the calls list, decrypting metadata only. */
export async function reindexCandidates(
  ctx: ClientContext,
  mode: 'translate' | 'all',
): Promise<string[]> {
  const ids: string[] = [];
  const { rules } = (await ctx.userData.get('providers')).translation;
  let cursor: string | null = null;
  do {
    const page = await listCalls(ctx, { limit: 100, cursor });
    for (const row of page.items) {
      if (mode === 'all' || needsTranslation(await row.meta(), rules)) ids.push(row.id);
    }
    cursor = page.nextCursor;
  } while (cursor);
  return ids;
}

/**
 * Re-indexes many calls on this device, a few at a time, with progress. Stopping (the signal)
 * finishes the calls in flight and returns. It resumes by running again: in `translate` mode
 * the calls already done no longer show up as candidates.
 */
export async function reindexCalls(
  ctx: ClientContext,
  opts: ReindexRunOptions,
): Promise<ReindexProgress> {
  const ids = await reindexCandidates(ctx, opts.mode);
  const progress: ReindexProgress = {
    done: 0,
    total: ids.length,
    reindexed: 0,
    untranslated: 0,
    failed: 0,
  };
  opts.onProgress?.({ ...progress });
  let next = 0;
  const worker = async () => {
    while (next < ids.length && !opts.signal?.aborted) {
      const id = ids[next++]!;
      try {
        const outcome = await reindexCall(ctx, id, {
          translate: opts.mode === 'translate',
          ...(opts.signal && { signal: opts.signal }),
        });
        if (outcome === 'untranslated') progress.untranslated++;
        else progress.reindexed++;
      } catch {
        if (opts.signal?.aborted) break;
        progress.failed++;
      }
      progress.done++;
      opts.onProgress?.({ ...progress });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 2) }, worker));
  return progress;
}
