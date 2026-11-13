import { token, tokenSet } from '@askcalls/crypto';
import { DomainError } from '@askcalls/domain';
import { BUILT_IN_INTENTS, STAR_TAG_ID } from '@askcalls/indexing';
import type { KeySession } from './session';
import { randomId, type Tag, type UserDataStore } from './userdata';

export { STAR_TAG_ID };

export const INTENT_TAG_PREFIX = 'intent:';

/** Intents are tag ids `intent:<id>`, hashed with kind `t`, so they filter like tags. */
export const intentTagId = (intentId: string) => `${INTENT_TAG_PREFIX}${intentId}`;

export const tagToken = (session: KeySession, tagId: string) =>
  token(session.keys.indexKey, 't', tagId);

export const tagTokens = (session: KeySession, tagIds: Iterable<string>) =>
  tokenSet(session.keys.indexKey, 't', tagIds);

export type ResolvedTag =
  | { kind: 'star'; id: typeof STAR_TAG_ID }
  | { kind: 'intent'; id: string; intentId: string }
  | { kind: 'tag'; id: string; tag: Tag };

/**
 * Maps the opaque `tagToks` of a call back to catalog entries. Built from the decrypted catalog,
 * the star tag and every known intent; tokens it can't resolve (deleted tags) are dropped.
 */
export class TagDirectory {
  private constructor(
    readonly tags: readonly Tag[],
    private readonly byToken: Map<bigint, ResolvedTag>,
    private readonly byId: Map<string, bigint>,
  ) {}

  static async build(
    session: KeySession,
    tags: readonly Tag[],
    intentIds: readonly string[],
  ): Promise<TagDirectory> {
    const entries: ResolvedTag[] = [
      { kind: 'star', id: STAR_TAG_ID },
      ...intentIds.map((i) => ({ kind: 'intent' as const, id: intentTagId(i), intentId: i })),
      ...tags.map((tag) => ({ kind: 'tag' as const, id: tag.id, tag })),
    ];
    const toks = await Promise.all(entries.map((e) => tagToken(session, e.id)));
    return new TagDirectory(
      tags,
      new Map(entries.map((e, i) => [toks[i]!, e])),
      new Map(entries.map((e, i) => [e.id, toks[i]!])),
    );
  }

  resolve(tagToks: readonly bigint[]): ResolvedTag[] {
    return tagToks.flatMap((t) => {
      const r = this.byToken.get(t);
      return r ? [r] : [];
    });
  }

  tokenOf(tagId: string): bigint | undefined {
    return this.byId.get(tagId);
  }

  isStarred(tagToks: readonly bigint[]): boolean {
    const star = this.byId.get(STAR_TAG_ID)!;
    return tagToks.includes(star);
  }

  findByName(name: string): Tag | undefined {
    const n = name.trim().toLocaleLowerCase();
    return this.tags.find((t) => t.name.trim().toLocaleLowerCase() === n);
  }
}

/** Built-in plus the user's own intent ids. */
export function knownIntentIds(customIntentIds: readonly string[]): string[] {
  return [...new Set([...BUILT_IN_INTENTS.map((i) => i.id), ...customIntentIds])];
}

export async function createTag(
  userData: UserDataStore,
  input: { name: string; color?: string | null },
): Promise<Tag> {
  const tag: Tag = { id: randomId(), name: input.name.trim(), color: input.color ?? null };
  if (!tag.name) throw new DomainError('invalid', 'tag name is empty');
  await userData.update('tags', (d) => ({ ...d, tags: [...d.tags, tag] }));
  return tag;
}

export async function renameTag(
  userData: UserDataStore,
  id: string,
  patch: { name?: string; color?: string | null },
): Promise<void> {
  await userData.update('tags', (d) => ({
    ...d,
    tags: d.tags.map((t) =>
      t.id === id
        ? {
            ...t,
            ...(patch.name && { name: patch.name.trim() }),
            ...(patch.color !== undefined && { color: patch.color }),
          }
        : t,
    ),
  }));
}

/** Removes a tag from the catalog. Calls keep its token, which no longer resolves to a name. */
export async function deleteTag(userData: UserDataStore, id: string): Promise<void> {
  await userData.update('tags', (d) => ({ ...d, tags: d.tags.filter((t) => t.id !== id) }));
}

/** Tag ids for names, creating catalog entries for names it doesn't know (manifest `tags`). */
export async function ensureTags(
  userData: UserDataStore,
  names: readonly string[],
): Promise<string[]> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (wanted.length === 0) return [];
  const key = (n: string) => n.toLocaleLowerCase();
  const current = await userData.get('tags');
  const find = (tags: readonly Tag[], n: string) => tags.find((t) => key(t.name) === key(n));
  if (wanted.every((n) => find(current.tags, n))) {
    return wanted.map((n) => find(current.tags, n)!.id);
  }
  const doc = await userData.update('tags', (d) => {
    const known = new Set(d.tags.map((t) => key(t.name)));
    const added = wanted
      .filter((n) => !known.has(key(n)))
      .map((name): Tag => ({ id: randomId(), name, color: null }));
    return added.length ? { ...d, tags: [...d.tags, ...added] } : d;
  });
  return wanted.map((n) => find(doc.tags, n)!.id);
}
