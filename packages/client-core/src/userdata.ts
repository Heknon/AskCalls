import { type ApiClient, ApiError } from '@askcalls/api-contract';
import { getUserData, putUserData } from '@askcalls/api-contract/routes/userdata';
import {
  AadFields,
  aad,
  decryptJson,
  encryptJson,
  randomBytes,
  toBase64Url,
} from '@askcalls/crypto';
import { DomainError, MAX_TRANSLATIONS_PER_CALL, type UserDataKind } from '@askcalls/domain';
import {
  DEFAULT_INTENT_THRESHOLD,
  IntentDefinitionSchema,
  RuleSchema,
  SynonymEntrySchema,
} from '@askcalls/indexing';
import { z } from 'zod';
import type { KeySession } from './session';

/** Random catalog id (tags, contacts): 16 bytes, base64url. Never derived from a name. */
export const randomId = () => toBase64Url(randomBytes(16));

const Id = z.string().min(1).max(64);

export const TagSchema = z.object({
  id: Id,
  name: z.string().min(1).max(100),
  color: z.string().max(32).nullable().default(null),
});
export const TagsDocSchema = z.object({ v: z.literal(1), tags: z.array(TagSchema).max(1_000) });

export const ContactSchema = z.object({
  id: Id,
  name: z.string().min(1).max(200),
  phones: z.array(z.string().min(1).max(40)).max(20),
});
export const ContactsDocSchema = z.object({
  v: z.literal(1),
  contacts: z.array(ContactSchema).max(20_000),
});

export const RulesDocSchema = z.object({ v: z.literal(1), rules: z.array(RuleSchema).max(200) });

export const SynonymsDocSchema = z.object({
  v: z.literal(1),
  entries: z.array(SynonymEntrySchema).max(2_000),
});

export const SettingsDocSchema = z.object({
  v: z.literal(1),
  autoLockMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .default(15),
  backupRecordings: z.boolean().default(false),
  intentThreshold: z.number().min(0).max(1).default(DEFAULT_INTENT_THRESHOLD),
  includePrefixes: z.boolean().default(false),
  /** Transcription language hint: `auto` or a BCP-47 code. */
  language: z.string().max(35).default('auto'),
  phoneRegion: z.string().length(2).default('IL'),
  customIntents: z.array(IntentDefinitionSchema).max(50).default([]),
});

const OwnKey = z.object({
  provider: z.string().min(1).max(64),
  apiKey: z.string().min(1).max(4_096),
  baseUrl: z.string().max(2_048).nullable().default(null),
  model: z.string().max(200).nullable().default(null),
});
const Capability = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('managed') }),
  z.object({ mode: z.literal('off') }),
  z.object({ mode: z.literal('own'), key: OwnKey }),
]);
export const BucketSchema = z.object({
  id: Id,
  endpoint: z.string().min(1).max(2_048),
  bucket: z.string().min(1).max(255),
  region: z.string().max(64),
  accessKeyId: z.string().min(1).max(256),
  secretAccessKey: z.string().min(1).max(4_096),
});
/** A linked Google Drive (scope `drive.file`): the refresh token never leaves this document. */
export const DriveSchema = z.object({
  id: Id,
  refreshToken: z.string().min(1),
  /** The "AskCalls recordings" folder, once a device has created or found it. */
  folderId: z.string().nullable(),
});
const Iso6391 = z.string().regex(/^[a-z]{2}$/);
/** `from: 'any'`: every language no other rule names. */
export const TranslationRuleSchema = z.object({
  from: z.union([z.literal('any'), Iso6391]),
  to: z.array(Iso6391).min(1).max(MAX_TRANSLATIONS_PER_CALL),
});
export type TranslationRuleInput = z.output<typeof TranslationRuleSchema>;

/**
 * What a new account starts with (written at onboarding, shown on the sample step): Hebrew calls
 * are also stored in English. Accounts from before translation keep no rules: nothing of theirs
 * goes to the LLM until they add one.
 */
export const DEFAULT_TRANSLATION_RULES: TranslationRuleInput[] = [{ from: 'he', to: ['en'] }];

/** Own provider keys and buckets (spec 11.2a). Decrypted only on the device. */
export const ProvidersDocSchema = z.object({
  v: z.literal(1),
  transcription: Capability.default({ mode: 'managed' }),
  llm: Capability.default({ mode: 'managed' }),
  /**
   * Translation at ingest, through the `llm` choice (managed or own key): calls in a rule's
   * `from` language are also stored in each `to` language. No rules: translation is off.
   */
  // One rule per source language (the editor keeps it so); on a duplicate the first one applies.
  translation: z.object({ rules: z.array(TranslationRuleSchema).max(20) }).default({ rules: [] }),
  recordings: z
    .discriminatedUnion('mode', [
      z.object({ mode: z.literal('managed') }),
      z.object({ mode: z.literal('off') }),
      z.object({ mode: z.literal('own'), bucket: BucketSchema }),
      z.object({ mode: z.literal('drive'), drive: DriveSchema }),
    ])
    .default({ mode: 'managed' }),
  /**
   * Own stores this account switched away from. They may still hold recordings, so the device
   * keeps their credentials to move or delete those.
   */
  previousStores: z
    .array(z.union([BucketSchema, DriveSchema]))
    .max(16)
    .default([]),
});

export const USER_DATA_SCHEMAS = {
  tags: TagsDocSchema,
  contacts: ContactsDocSchema,
  rules: RulesDocSchema,
  synonyms: SynonymsDocSchema,
  settings: SettingsDocSchema,
  providers: ProvidersDocSchema,
} as const satisfies Record<UserDataKind, z.ZodType>;

export type UserDataDocs = { [K in UserDataKind]: z.output<(typeof USER_DATA_SCHEMAS)[K]> };
export type Tag = z.output<typeof TagSchema>;
export type Contact = z.output<typeof ContactSchema>;
export type Settings = UserDataDocs['settings'];
export type Providers = UserDataDocs['providers'];

const EMPTY: { [K in UserDataKind]: z.input<(typeof USER_DATA_SCHEMAS)[K]> } = {
  tags: { v: 1, tags: [] },
  contacts: { v: 1, contacts: [] },
  rules: { v: 1, rules: [] },
  synonyms: { v: 1, entries: [] },
  settings: { v: 1 },
  providers: { v: 1 },
};

const LIST_KEY = {
  tags: { field: 'tags', key: (x: { id: string }) => x.id },
  contacts: { field: 'contacts', key: (x: { id: string }) => x.id },
  rules: { field: 'rules', key: (x: { id: string }) => x.id },
  synonyms: { field: 'entries', key: (x: { canonical: string }) => x.canonical },
} as const;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Three-way merge by item key: an item one side left untouched takes the other side's version
 * (including its deletion); an item both sides changed keeps ours. Order follows theirs, then
 * our new items.
 */
export function mergeKeyed<T>(
  base: readonly T[],
  ours: readonly T[],
  theirs: readonly T[],
  key: (x: T) => string,
): T[] {
  const b = new Map(base.map((x) => [key(x), x]));
  const o = new Map(ours.map((x) => [key(x), x]));
  const t = new Map(theirs.map((x) => [key(x), x]));
  const pick = (k: string): T | undefined => {
    const [bx, ox, tx] = [b.get(k), o.get(k), t.get(k)];
    return same(ox, bx) ? tx : ox;
  };
  const out: T[] = [];
  const seen = new Set<string>();
  for (const k of [...t.keys(), ...o.keys()]) {
    if (seen.has(k)) continue;
    seen.add(k);
    const v = pick(k);
    if (v !== undefined) out.push(v);
  }
  return out;
}

/** Field-level three-way merge for flat documents (settings, providers). */
export function mergeFields<T extends Record<string, unknown>>(base: T, ours: T, theirs: T): T {
  const out: Record<string, unknown> = { ...theirs };
  for (const k of Object.keys(ours)) {
    if (!same(ours[k], base[k])) out[k] = ours[k];
  }
  return out as T;
}

export function mergeDoc<K extends UserDataKind>(
  kind: K,
  base: UserDataDocs[K],
  ours: UserDataDocs[K],
  theirs: UserDataDocs[K],
): UserDataDocs[K] {
  if (kind in LIST_KEY) {
    const { field, key } = LIST_KEY[kind as keyof typeof LIST_KEY];
    const get = (d: unknown) => (d as Record<string, unknown[]>)[field] ?? [];
    return {
      ...theirs,
      [field]: mergeKeyed(get(base), get(ours), get(theirs), key as (x: unknown) => string),
    } as UserDataDocs[K];
  }
  return mergeFields(
    base as Record<string, unknown>,
    ours as Record<string, unknown>,
    theirs as Record<string, unknown>,
  ) as UserDataDocs[K];
}

interface Loaded<K extends UserDataKind> {
  value: UserDataDocs[K];
  version: number;
}

const MAX_ATTEMPTS = 5;

const isConflict = (e: unknown) => e instanceof ApiError && e.code === 'version_conflict';

/**
 * Typed, encrypted user documents (`UserData:<kind>`) with optimistic concurrency. Decrypted
 * copies are cached in memory and dropped on lock.
 */
export class UserDataStore {
  #cache = new Map<UserDataKind, Loaded<UserDataKind>>();

  constructor(
    private readonly api: ApiClient,
    private readonly session: KeySession,
  ) {
    session.onWipe(() => this.#cache.clear());
  }

  #aad(kind: UserDataKind) {
    return aad({ userId: this.session.userId, field: AadFields.userData(kind) });
  }

  async #fetch<K extends UserDataKind>(kind: K): Promise<Loaded<K>> {
    const { kek } = this.session.keys;
    const res = await this.api.request(getUserData, { params: { kind } });
    const raw = res.ct ? await decryptJson(kek, res.ct, this.#aad(kind)) : EMPTY[kind];
    const parsed = USER_DATA_SCHEMAS[kind].safeParse(raw);
    if (!parsed.success)
      throw new DomainError('invalid', 'stored user data has an unexpected shape');
    const loaded = { value: parsed.data as UserDataDocs[K], version: res.version };
    this.#cache.set(kind, loaded as Loaded<UserDataKind>);
    return loaded;
  }

  async get<K extends UserDataKind>(
    kind: K,
    opts: { fresh?: boolean } = {},
  ): Promise<UserDataDocs[K]> {
    const cached = this.#cache.get(kind) as Loaded<K> | undefined;
    if (cached && !opts.fresh) return cached.value;
    return (await this.#fetch(kind)).value;
  }

  async #write<K extends UserDataKind>(kind: K, value: UserDataDocs[K], expectedVersion: number) {
    const valid = USER_DATA_SCHEMAS[kind].parse(value) as UserDataDocs[K];
    const ct = await encryptJson(this.session.keys.kek, valid, this.#aad(kind));
    const { version } = await this.api.request(putUserData, {
      params: { kind },
      body: { ct, expectedVersion },
    });
    this.#cache.set(kind, { value: valid, version } as Loaded<UserDataKind>);
    return valid;
  }

  /**
   * Applies `mutate` to the latest document and writes it. On a version conflict the mutation is
   * re-applied to the newer document, so concurrent edits from other devices are kept.
   */
  async update<K extends UserDataKind>(
    kind: K,
    mutate: (current: UserDataDocs[K]) => UserDataDocs[K],
  ): Promise<UserDataDocs[K]> {
    let current = (this.#cache.get(kind) as Loaded<K> | undefined) ?? (await this.#fetch(kind));
    for (let attempt = 1; ; attempt++) {
      const next = mutate(structuredClone(current.value));
      try {
        return await this.#write(kind, next, current.version);
      } catch (e) {
        if (!isConflict(e) || attempt >= MAX_ATTEMPTS) throw e;
        current = await this.#fetch(kind);
      }
    }
  }

  /**
   * Writes a whole edited document that started from `base` (what the editor loaded). On a
   * conflict it three-way merges with the newer document (`mergeDoc`) and retries.
   */
  async put<K extends UserDataKind>(
    kind: K,
    edited: UserDataDocs[K],
    base: { value: UserDataDocs[K]; version: number },
  ): Promise<UserDataDocs[K]> {
    let theirs = base;
    for (let attempt = 1; ; attempt++) {
      const next = theirs === base ? edited : mergeDoc(kind, base.value, edited, theirs.value);
      try {
        return await this.#write(kind, next, theirs.version);
      } catch (e) {
        if (!isConflict(e) || attempt >= MAX_ATTEMPTS) throw e;
        theirs = await this.#fetch(kind);
      }
    }
  }

  /** The cached document with its version, for editors that later call `put`. */
  async snapshot<K extends UserDataKind>(kind: K): Promise<Loaded<K>> {
    const cached = this.#cache.get(kind) as Loaded<K> | undefined;
    return structuredClone(cached ?? (await this.#fetch(kind)));
  }
}
