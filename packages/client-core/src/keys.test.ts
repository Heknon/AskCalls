import { createApiClient } from '@askcalls/api-contract';
import { describe, expect, it } from 'vitest';
import { Onboarding } from './keys';
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
