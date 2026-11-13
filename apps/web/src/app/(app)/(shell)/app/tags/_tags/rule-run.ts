import { type CallRow, getCall, listCalls, updateCallTags } from '@askcalls/client-core/calls';
import type { ClientContext } from '@askcalls/client-core/context';
import { tagTokens } from '@askcalls/client-core/tags';
import {
  analyzeCall,
  type CountryCode,
  contactPhoneSet,
  DEFAULT_PHONE_REGION,
  evaluateRules,
  isPhoneRegion,
  type Rule,
  type RuleFacts,
} from '@askcalls/indexing';

const PAGE = 100;
const PARALLEL = 4;

/** Everything a rule looks at except the call: contacts, synonyms, region. */
interface Env {
  key: string;
  region: CountryCode;
  contactPhones: ReadonlySet<string>;
  analyze: (call: Awaited<ReturnType<typeof getCall>>) => RuleFacts;
}

async function loadEnv(ctx: ClientContext): Promise<Env> {
  const [settings, contacts, synonyms] = await Promise.all([
    ctx.userData.get('settings'),
    ctx.userData.get('contacts'),
    ctx.userData.get('synonyms'),
  ]);
  const region = isPhoneRegion(settings.phoneRegion) ? settings.phoneRegion : DEFAULT_PHONE_REGION;
  const contactPhones = contactPhoneSet(contacts.contacts, region);
  return {
    key: JSON.stringify([region, synonyms.entries]),
    region,
    contactPhones,
    analyze(call) {
      const a = analyzeCall({
        transcript: call.transcript,
        meta: {
          phone: call.meta.phoneE164,
          contactName: call.meta.contactName,
          direction: call.meta.direction,
          durationSec: call.meta.durationSec,
        },
        contacts: contacts.contacts,
        synonyms: synonyms.entries,
        region,
      });
      return {
        keywordCounts: a.keywordCounts,
        intentIds: call.tags.flatMap((t) => (t.kind === 'intent' ? [t.intentId] : [])),
        phoneE164: call.meta.phoneE164,
        contactPhones,
        durationBucket: call.durationBucket,
        direction: call.meta.direction,
        texts: call.transcript.segments.map((s) => s.text),
      };
    },
  };
}

/**
 * What rules look at, per call, decrypted and analysed on this device. Held in memory for the
 * screen only (it is derived from transcripts) and wiped on lock.
 */
export class FactsCache {
  #key: string | null = null;
  #facts = new Map<string, RuleFacts>();

  clear() {
    this.#facts.clear();
    this.#key = null;
  }

  async get(ctx: ClientContext, env: Env, id: string): Promise<RuleFacts> {
    if (this.#key !== env.key) {
      this.#facts.clear();
      this.#key = env.key;
    }
    const hit = this.#facts.get(id);
    if (hit) return { ...hit, contactPhones: env.contactPhones };
    const facts = env.analyze(await getCall(ctx, id));
    this.#facts.set(id, facts);
    return facts;
  }
}

export interface RunOptions {
  cache: FactsCache;
  signal?: AbortSignal;
  onProgress?: (done: number) => void;
}

async function* pages(ctx: ClientContext): AsyncGenerator<CallRow[]> {
  let cursor: string | null = null;
  do {
    const page = await listCalls(ctx, { limit: PAGE, cursor });
    yield page.items;
    cursor = page.nextCursor;
  } while (cursor);
}

async function forEachCall(
  ctx: ClientContext,
  opts: RunOptions,
  visit: (row: CallRow, facts: RuleFacts, env: Env) => Promise<void>,
): Promise<boolean> {
  const env = await loadEnv(ctx);
  let done = 0;
  for await (const rows of pages(ctx)) {
    for (let i = 0; i < rows.length; i += PARALLEL) {
      if (opts.signal?.aborted) return false;
      await Promise.all(
        rows.slice(i, i + PARALLEL).map(async (row) => {
          await visit(row, await opts.cache.get(ctx, env, row.id), env);
          opts.onProgress?.(++done);
        }),
      );
    }
  }
  return !opts.signal?.aborted;
}

/** How many existing calls a rule matches, evaluated on the device. */
export async function countMatches(
  ctx: ClientContext,
  rule: Rule,
  opts: RunOptions,
): Promise<number | null> {
  let n = 0;
  const finished = await forEachCall(ctx, opts, async (_row, facts, env) => {
    if (
      evaluateRules([{ ...rule, enabled: true }], facts, { region: env.region }).matchedRuleIds
        .length
    )
      n++;
  });
  return finished ? n : null;
}

/**
 * "Apply to existing calls" (spec 7.11): every call is decrypted and analysed on the device in
 * batches, and the rule's tags are added where it matches. Returns the calls it matched.
 */
export async function applyRule(
  ctx: ClientContext,
  rule: Rule,
  opts: RunOptions,
): Promise<{ matched: number; changed: number; finished: boolean }> {
  let matched = 0;
  let changed = 0;
  const finished = await forEachCall(ctx, opts, async (row, facts, env) => {
    const out = evaluateRules([{ ...rule, enabled: true }], facts, { region: env.region });
    if (out.matchedRuleIds.length === 0) return;
    matched++;
    const toks = await tagTokens(ctx.session, out.tagIds);
    if (toks.every((t) => row.tagToks.includes(t))) return;
    await updateCallTags(ctx, row, { add: out.tagIds });
    changed++;
  });
  return { matched, changed, finished };
}
