import { DEVICE_SECRETS, type DeviceKeyStore, type SecretStore } from '@askcalls/client-core';
import {
  decrypt,
  encrypt,
  exportSigningPrivateKey,
  fromBase64Url,
  fromUtf8,
  hkdfBytes,
  importAesKey,
  importSigningPrivateKey,
  toBase64Url,
  utf8,
  wipeBytes,
} from '@askcalls/crypto';
import { DomainError } from '@askcalls/domain';

const NAME = 'device-signing-key';
const WRAP_INFO = 'askcalls/agent/v1/device-signing-key';

const aadFor = (deviceKeyId: string) => utf8(`${WRAP_INFO}\0${deviceKeyId}`);

async function wrapKey(secrets: SecretStore): Promise<CryptoKey> {
  const secret = await secrets.get(DEVICE_SECRETS.deviceSecret);
  if (!secret) throw new DomainError('not_found', 'this device is not linked');
  try {
    return await importAesKey(await hkdfBytes(secret, WRAP_INFO));
  } finally {
    wipeBytes(secret);
  }
}

/**
 * The agent's ECDSA signing key (spec 6.1). Generated extractable, then stored as PKCS#8
 * encrypted with a key derived from the device secret, both in the SecretStore. Loaded back as
 * a non-extractable CryptoKey.
 */
export class SecretStoreDeviceKeys implements DeviceKeyStore {
  readonly extractable = true;

  constructor(private readonly secrets: SecretStore) {}

  async load(): Promise<{ deviceKeyId: string; privateKey: CryptoKey } | null> {
    const stored = await this.secrets.get(NAME);
    if (!stored) return null;
    const { id, ct } = JSON.parse(fromUtf8(stored)) as { id: string; ct: string };
    const pkcs8 = await decrypt(await wrapKey(this.secrets), fromBase64Url(ct), aadFor(id));
    try {
      return { deviceKeyId: id, privateKey: await importSigningPrivateKey(pkcs8) };
    } finally {
      wipeBytes(pkcs8);
    }
  }

  async save(deviceKeyId: string, privateKey: CryptoKey): Promise<void> {
    const pkcs8 = await exportSigningPrivateKey(privateKey);
    try {
      const ct = await encrypt(await wrapKey(this.secrets), pkcs8, aadFor(deviceKeyId));
      await this.secrets.set(NAME, utf8(JSON.stringify({ id: deviceKeyId, ct: toBase64Url(ct) })));
    } finally {
      wipeBytes(pkcs8);
    }
  }

  async clear(): Promise<void> {
    await this.secrets.delete(NAME);
  }
}
