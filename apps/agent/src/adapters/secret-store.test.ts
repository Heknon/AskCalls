import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEVICE_SECRETS } from '@askcalls/client-core';
import { MemorySecretStore } from '@askcalls/client-core/testing/fakes';
import {
  generateDeviceSecret,
  generateSigningKeyPair,
  signCall,
  utf8,
  verifyCall,
} from '@askcalls/crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SecretStoreDeviceKeys } from './device-keys';
import {
  EncryptedFileSecretStore,
  KeychainUnavailableError,
  openSecretStore,
} from './secret-store';

const FAST = { memoryKiB: 64, iterations: 1, parallelism: 1 };
const PASSPHRASE = 'correct horse battery staple';
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'askcalls-secrets-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('encrypted-file secret store (no OS keychain)', () => {
  it('round-trips per scope, encrypts at rest with owner-only permissions', async () => {
    const path = join(dir, 'a.enc');
    const store = await EncryptedFileSecretStore.open({
      path,
      scope: 'https://one.example',
      passphrase: PASSPHRASE,
      params: FAST,
    });
    await store.set('api-token', utf8('ac_supersecretvalue'));
    await store.set('gone', utf8('x'));
    await store.delete('gone');

    const raw = await readFile(path, 'utf8');
    expect(raw).not.toContain('supersecret');
    expect(raw).not.toContain('api-token');
    expect((await stat(path)).mode & 0o777).toBe(0o600);

    const reopened = await EncryptedFileSecretStore.open({
      path,
      scope: 'https://one.example',
      passphrase: PASSPHRASE,
    });
    expect(new TextDecoder().decode((await reopened.get('api-token'))!)).toBe(
      'ac_supersecretvalue',
    );
    expect(await reopened.get('gone')).toBeNull();
    const other = await EncryptedFileSecretStore.open({
      path,
      scope: 'https://two.example',
      passphrase: PASSPHRASE,
    });
    expect(await other.get('api-token')).toBeNull();
  });

  it('keeps every secret when several are set at once', async () => {
    const path = join(dir, 'concurrent.enc');
    const store = await EncryptedFileSecretStore.open({
      path,
      scope: 's',
      passphrase: PASSPHRASE,
      params: FAST,
    });
    const names = Array.from({ length: 8 }, (_, i) => `k${i}`);
    await Promise.all(names.map((n) => store.set(n, utf8(n))));
    const reopened = await EncryptedFileSecretStore.open({
      path,
      scope: 's',
      passphrase: PASSPHRASE,
    });
    for (const n of names) expect(new TextDecoder().decode((await reopened.get(n))!)).toBe(n);
  });

  it('refuses a wrong passphrase and a short new one', async () => {
    const path = join(dir, 'b.enc');
    const store = await EncryptedFileSecretStore.open({
      path,
      scope: 's',
      passphrase: PASSPHRASE,
      params: FAST,
    });
    await store.set('k', utf8('v'));
    await expect(
      EncryptedFileSecretStore.open({ path, scope: 's', passphrase: 'not the right one' }),
    ).rejects.toThrow(/wrong passphrase/);
    await expect(
      EncryptedFileSecretStore.open({ path: join(dir, 'c.enc'), scope: 's', passphrase: 'short' }),
    ).rejects.toThrow();
  });

  it('is chosen only when no keychain answers, and needs the passphrase variable', async () => {
    const filePath = join(dir, 'd.enc');
    await expect(
      openSecretStore({ scope: 's', filePath, env: { ASKCALLS_KEYSTORE: 'file' } }),
    ).rejects.toBeInstanceOf(KeychainUnavailableError);
    const opened = await openSecretStore({
      scope: 's',
      filePath,
      env: { ASKCALLS_KEYSTORE: 'file', ASKCALLS_KEYSTORE_PASSPHRASE: PASSPHRASE },
    });
    expect(opened.kind).toBe('encrypted-file');
  });
});

describe('device signing key store', () => {
  it('keeps the PKCS#8 key encrypted under the device secret and loads it non-extractable', async () => {
    const secrets = new MemorySecretStore();
    await secrets.set(DEVICE_SECRETS.deviceSecret, generateDeviceSecret());
    const keys = new SecretStoreDeviceKeys(secrets);
    expect(await keys.load()).toBeNull();
    const pair = await generateSigningKeyPair({ extractable: keys.extractable });
    await keys.save('dev-1', pair.privateKey);

    const stored = new TextDecoder().decode((await secrets.get('device-signing-key'))!);
    expect(stored).toContain('dev-1');
    const loaded = (await keys.load())!;
    expect(loaded.deviceKeyId).toBe('dev-1');
    expect(loaded.privateKey.extractable).toBe(false);
    const input = { callId: 'c1', contentTok: 42n, transcriptPlaintext: utf8('hello') };
    expect(await verifyCall(pair.publicKey, input, await signCall(loaded.privateKey, input))).toBe(
      true,
    );

    await secrets.set(DEVICE_SECRETS.deviceSecret, generateDeviceSecret());
    await expect(keys.load()).rejects.toThrow();
  });
});
