import { createApiClient } from '@askcalls/api-contract';
import { generateRootKey } from '@askcalls/crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { KeySession } from './session';
import { mergeDoc, mergeFields, mergeKeyed, type UserDataDocs, UserDataStore } from './userdata';

describe('three-way merge', () => {
  const key = (x: { id: string }) => x.id;
  const t = (id: string, name: string) => ({ id, name });

  it('keeps both sides’ independent edits, additions and deletions', () => {
    const base = [t('a', 'A'), t('b', 'B'), t('c', 'C')];
    const ours = [t('a', 'A2'), t('b', 'B'), t('d', 'D')];
    const theirs = [t('a', 'A'), t('b', 'B3'), t('c', 'C'), t('e', 'E')];
    expect(mergeKeyed(base, ours, theirs, key)).toEqual([
      t('a', 'A2'),
      t('b', 'B3'),
      t('e', 'E'),
      t('d', 'D'),
    ]);
  });

  it('prefers ours when both changed the same item, and theirs deletion of an untouched one', () => {
    const base = [t('a', 'A'), t('b', 'B')];
    expect(mergeKeyed(base, [t('a', 'ours'), t('b', 'B')], [t('a', 'theirs')], key)).toEqual([
      t('a', 'ours'),
    ]);
  });

  it('merges flat documents field by field', () => {
    const base = { v: 1, x: 1, y: 1, z: [1] };
    expect(mergeFields(base, { ...base, x: 2 }, { ...base, y: 3, z: [2] })).toEqual({
      v: 1,
      x: 2,
      y: 3,
      z: [2],
    });
  });

  it('merges synonyms by canonical form', () => {
    const doc = (entries: Array<{ canonical: string; variants: string[] }>) =>
      ({ v: 1, entries }) as UserDataDocs['synonyms'];
    const merged = mergeDoc(
      'synonyms',
      doc([]),
      doc([{ canonical: 'iphone', variants: ['אייפון'] }]),
      doc([{ canonical: 'galaxy', variants: ['גלקסי'] }]),
    );
    expect(merged.entries.map((e) => e.canonical)).toEqual(['galaxy', 'iphone']);
  });
});

/** A one-route server: GET/PUT /api/userdata/:kind with optimistic versions. */
function userDataServer() {
  const rows = new Map<string, { ct: string; version: number }>();
  const fetch = async (url: string, init: RequestInit) => {
    const kind = new URL(url).pathname.split('/').pop()!;
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (init.method === 'GET') {
      const r = rows.get(kind);
      return json(200, { kind, ct: r?.ct ?? null, version: r?.version ?? 0 });
    }
    const body = JSON.parse(init.body as string) as { ct: string; expectedVersion: number };
    const current = rows.get(kind)?.version ?? 0;
    if (current !== body.expectedVersion) {
      return json(409, {
        error: { code: 'version_conflict', message: 'user data changed', details: { current } },
      });
    }
    rows.set(kind, { ct: body.ct, version: current + 1 });
    return json(200, { version: current + 1 });
  };
  return {
    api: createApiClient({ baseUrl: 'http://test', fetch }),
    rows,
  };
}

describe('UserDataStore', () => {
  let session: KeySession;
  beforeEach(async () => {
    session = new KeySession({ idleTimeoutMs: 0 });
    await session.unlock({ userId: 'user-1', rootKey: generateRootKey() });
  });

  it('round-trips encrypted documents with defaults and stores only ciphertext', async () => {
    const server = userDataServer();
    const store = new UserDataStore(server.api, session);
    expect(await store.get('settings')).toMatchObject({ autoLockMinutes: 15, language: 'auto' });
    await store.update('tags', (d) => ({
      ...d,
      tags: [{ id: 't1', name: 'Hot lead', color: null }],
    }));
    expect(atob(server.rows.get('tags')!.ct)).not.toContain('Hot lead');
    const other = new UserDataStore(server.api, session);
    expect((await other.get('tags')).tags[0]?.name).toBe('Hot lead');
  });

  it('re-applies a mutation on a version conflict, keeping the other device’s write', async () => {
    const server = userDataServer();
    const a = new UserDataStore(server.api, session);
    const b = new UserDataStore(server.api, session);
    await Promise.all([a.get('contacts'), b.get('contacts')]);
    let attempts = 0;
    await b.update('contacts', (d) => ({
      ...d,
      contacts: [...d.contacts, { id: 'b', name: 'From B', phones: [], aliases: [] }],
    }));
    await a.update('contacts', (d) => {
      attempts++;
      return {
        ...d,
        contacts: [...d.contacts, { id: 'a', name: 'From A', phones: ['0541'], aliases: [] }],
      };
    });
    expect(attempts).toBe(2);
    const fresh = await new UserDataStore(server.api, session).get('contacts');
    expect(fresh.contacts.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });

  it('three-way merges an edited document on conflict', async () => {
    const server = userDataServer();
    const a = new UserDataStore(server.api, session);
    const b = new UserDataStore(server.api, session);
    const base = await a.snapshot('settings');
    await b.update('settings', (d) => ({ ...d, language: 'he' }));
    await a.put('settings', { ...base.value, autoLockMinutes: 5 }, base);
    const fresh = await new UserDataStore(server.api, session).get('settings');
    expect(fresh).toMatchObject({ language: 'he', autoLockMinutes: 5 });
  });

  it('rejects invalid documents and clears its cache on lock', async () => {
    const server = userDataServer();
    const store = new UserDataStore(server.api, session);
    await expect(store.update('settings', (d) => ({ ...d, intentThreshold: 7 }))).rejects.toThrow();
    await store.get('tags');
    session.lock();
    await expect(store.get('tags')).rejects.toThrow(/locked/);
  });
});
