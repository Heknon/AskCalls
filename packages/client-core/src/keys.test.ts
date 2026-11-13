import { createApiClient } from '@askcalls/api-contract';
import { getKeyringEntry, listKeyring } from '@askcalls/api-contract/routes/keyring';
import { createRecoveryEntry, generateRootKey } from '@askcalls/crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Onboarding, verifyUnlock } from './keys';
import { KeySession } from './session';
import { FakePasskeys, MemoryDeviceKeyStore } from './testing/fakes';

describe('Onboarding', () => {
  it('offers the passphrase fallback when PRF is missing and requires both groups', async () => {
    const o = await Onboarding.begin('user-1');
    expect(await o.addPasskey(new FakePasskeys(false), { userName: 'u', label: 'Key' })).toBe(
      false,
    );
    await expect(o.addPassphrase('too short')).rejects.toMatchObject({ reason: 'weak_passphrase' });
    await o.addPassphrase('twelve chars or more');

    const [g1, g2] = o.confirmationGroups;
    expect(g1).not.toBe(g2);
    expect(o.confirmRecovery({ [g1]: o.recoveryGroups[g1]! })).toBe(false);
    expect(o.confirmRecovery({ [g1]: o.recoveryGroups[g1]!, [g2]: 'ZZZZ' })).toBe(false);

    let requests = 0;
    const api = createApiClient({
      fetch: async () => {
        requests++;
        return new Response('{}', { status: 500 });
      },
    });
    const finish = {
      api,
      session: new KeySession({ idleTimeoutMs: 0 }),
      deviceKeys: new MemoryDeviceKeyStore(),
      deviceLabel: 'Laptop',
    };
    await expect(o.finish(finish)).rejects.toThrow(/confirm/);
    expect(requests).toBe(0);

    expect(o.confirmRecovery({ [g1]: o.recoveryGroups[g1]!, [g2]: o.recoveryGroups[g2]! })).toBe(
      true,
    );
    await expect(o.finish(finish)).rejects.toMatchObject({ status: 500 });
    expect(finish.session.isUnlocked).toBe(false);
    o.discard();
    await expect(o.finish(finish)).rejects.toThrow(/already finished/);
  });
});

describe('verifyUnlock', () => {
  it('accepts the current recovery code and rejects a wrong one or another key', async () => {
    const userId = 'user-1';
    const rootKey = generateRootKey();
    const other = await createRecoveryEntry({ userId, rootKey: generateRootKey() });
    const mine = await createRecoveryEntry({ userId, rootKey });
    const entries = [
      { id: 'r1', kind: 'recovery' as const, ...mine },
      { id: 'r2', kind: 'recovery' as const, ...other },
    ];
    const summary = (e: (typeof entries)[number]) => ({
      id: e.id,
      kind: e.kind,
      label: 'Recovery code',
      credentialId: null,
      kdfParams: e.kdfParams,
      createdAt: new Date(0),
      lastUsedAt: null,
      revokedAt: null,
    });
    const json = (body: unknown) => Response.json(body);
    const api = createApiClient({
      fetch: async (input) => {
        const path = new URL(String(input), 'http://x').pathname;
        if (path === '/api/keyring') {
          return json(
            z.encode(listKeyring.response, {
              entries: entries.map(summary),
              devices: [],
              userKeys: null,
            }),
          );
        }
        const e = entries.find((x) => path === `/api/keyring/${x.id}`)!;
        return json(
          z.encode(getKeyringEntry.response, { ...summary(e), wrappedRootKey: e.wrappedRootKey }),
        );
      },
    });
    const session = new KeySession({ idleTimeoutMs: 0 });
    await session.unlock({ userId, rootKey: new Uint8Array(rootKey) });

    await verifyUnlock({ method: 'recovery', code: mine.code }, { api, session });
    await expect(
      verifyUnlock({ method: 'recovery', code: 'A'.repeat(32) }, { api, session }),
    ).rejects.toBeTruthy();
    await expect(
      verifyUnlock({ method: 'recovery', code: other.code }, { api, session }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      verifyUnlock({ method: 'passphrase', passphrase: 'twelve chars or more' }, { api, session }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(session.isUnlocked).toBe(true);
  });
});
