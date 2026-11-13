import {
  confirmDeviceLink,
  fetchDeviceLink,
  getDeviceLinkStatus,
  joinDeviceLink,
  LINK_SESSION_TTL_MS,
  startDeviceLink,
} from '@askcalls/domain/use-cases/devices';
import {
  addKeyringEntry,
  getKeyringEntry,
  listKeyring,
  putUserKeys,
  registerDevice,
  revokeKeyringEntry,
} from '@askcalls/domain/use-cases/keyring';
import { beforeEach, describe, expect, it } from 'vitest';
import { rand, session, tokenActor } from '../testing/fixtures';
import { makeTestPorts, type TestPorts } from '../testing/ports';

let ports: TestPorts;
let a: string;
let b: string;

beforeEach(async () => {
  ports = makeTestPorts();
  a = (await ports.users.create({ email: 'a@example.test' })).id;
  b = (await ports.users.create({ email: 'b@example.test' })).id;
});

const entry = (kind: 'passkey' | 'recovery' | 'passphrase' = 'recovery') => ({
  kind,
  label: kind,
  credentialId: kind === 'passkey' ? 'cred-1' : null,
  wrappedRootKey: rand(60),
  kdfParams: { salt: 'abc' },
});

describe('keyring', () => {
  it('adds, reads and revokes unlock methods with audit', async () => {
    const rec = await addKeyringEntry(ports, session(a), entry('recovery'));
    const pk = await addKeyringEntry(ports, session(a), entry('passkey'));
    const listed = await listKeyring(ports, session(a));
    expect(listed.entries.map((e) => e.kind).sort()).toEqual(['passkey', 'recovery']);
    expect('wrappedRootKey' in listed.entries[0]!).toBe(false);
    const full = await getKeyringEntry(ports, tokenActor(a, 't', ['keys']), pk.id);
    expect(full.wrappedRootKey.length).toBe(60);
    expect(full.lastUsedAt).toBeInstanceOf(Date);
    await expect(getKeyringEntry(ports, session(b), pk.id)).rejects.toMatchObject({
      code: 'not_found',
    });
    await revokeKeyringEntry(ports, session(a), pk.id);
    await expect(revokeKeyringEntry(ports, session(a), rec.id)).rejects.toMatchObject({
      code: 'conflict',
    });
    const acts = ports.db.audit.map((e) => e.action);
    expect(acts).toEqual(['keyring.add', 'keyring.add', 'keyring.read', 'keyring.revoke']);
  });

  it('rejects device rows, tokens and duplicate passkeys', async () => {
    await expect(
      addKeyringEntry(ports, session(a), { ...entry(), kind: 'device' }),
    ).rejects.toMatchObject({ code: 'invalid' });
    await expect(
      addKeyringEntry(ports, tokenActor(a, 't', ['keys']), entry()),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await addKeyringEntry(ports, session(a), entry('passkey'));
    await expect(addKeyringEntry(ports, session(a), entry('passkey'))).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('stores user keys only at increasing versions', async () => {
    const keys = { inboxPublicKey: rand(65), inboxPrivateKeyCt: rand(100), keyVersion: 1 };
    await putUserKeys(ports, session(a), keys);
    await expect(putUserKeys(ports, session(a), keys)).rejects.toMatchObject({
      code: 'version_conflict',
    });
    await putUserKeys(ports, session(a), { ...keys, keyVersion: 2 });
    expect((await listKeyring(ports, session(a))).userKeys?.keyVersion).toBe(2);
    expect((await listKeyring(ports, session(b))).userKeys).toBeNull();
  });

  it('registers this device', async () => {
    const d = await registerDevice(ports, session(a), {
      label: 'Laptop',
      signingPublicKey: rand(91),
    });
    expect((await listKeyring(ports, session(a))).devices.map((x) => x.id)).toEqual([d.id]);
  });
});

describe('device linking (spec 6.5)', () => {
  const joinInput = (secret: string) => ({
    secret,
    devicePublicKey: rand(65),
    deviceLabel: 'Agent',
    signingPublicKey: rand(91),
  });

  it('runs the handshake once and registers the device', async () => {
    const start = await startDeviceLink(ports, session(a));
    const stored = await ports.keyring.getLinkSession(start.sessionId);
    expect(stored?.secretHash.length).toBe(32);
    expect(JSON.stringify(stored)).not.toContain(start.secret);

    await expect(
      joinDeviceLink(ports, start.sessionId, joinInput('wrong-secret-0123456789')),
    ).rejects.toMatchObject({ code: 'not_found' });
    const join = joinInput(start.secret);
    await joinDeviceLink(ports, start.sessionId, join);
    await expect(joinDeviceLink(ports, start.sessionId, join)).rejects.toMatchObject({
      code: 'conflict',
    });
    expect(await fetchDeviceLink(ports, start.sessionId, { secret: start.secret })).toEqual({
      state: 'waiting_for_confirmation',
    });
    const status = await getDeviceLinkStatus(ports, session(a), start.sessionId);
    expect(status.devicePublicKey).toEqual(join.devicePublicKey);
    await expect(getDeviceLinkStatus(ports, session(b), start.sessionId)).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(
      confirmDeviceLink(ports, session(b), start.sessionId, { encryptedRootKey: rand(100) }),
    ).rejects.toMatchObject({ code: 'not_found' });

    const payload = rand(150);
    const done = await confirmDeviceLink(ports, session(a), start.sessionId, {
      encryptedRootKey: payload,
    });
    const fetched = await fetchDeviceLink(ports, start.sessionId, { secret: start.secret });
    expect(fetched).toEqual({
      state: 'completed',
      encryptedRootKey: payload,
      deviceKeyId: done.deviceKeyId,
      keyringEntryId: done.keyringEntryId,
    });
    await expect(
      fetchDeviceLink(ports, start.sessionId, { secret: start.secret }),
    ).rejects.toMatchObject({ code: 'not_found' });

    const device = await ports.keyring.getDevice(a, done.deviceKeyId);
    expect(device?.signingPublicKey).toEqual(join.signingPublicKey);
    expect(ports.db.audit.map((e) => e.action)).toEqual(['device.link_start', 'device.link']);

    // Revoking the device row unlinks the device.
    await revokeKeyringEntry(ports, session(a), done.keyringEntryId);
    expect((await ports.keyring.getDevice(a, done.deviceKeyId))?.revokedAt).toBeInstanceOf(Date);
  });

  it('expires after 10 minutes', async () => {
    const start = await startDeviceLink(ports, session(a));
    ports.fixedClock.advance(LINK_SESSION_TTL_MS);
    await expect(
      joinDeviceLink(ports, start.sessionId, joinInput(start.secret)),
    ).rejects.toMatchObject({ code: 'not_found', details: { reason: 'expired' } });
    expect((await getDeviceLinkStatus(ports, session(a), start.sessionId)).state).toBe('expired');
  });
});
