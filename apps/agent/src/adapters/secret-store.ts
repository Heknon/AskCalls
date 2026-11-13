import { readFile } from 'node:fs/promises';
import type { SecretStore } from '@askcalls/client-core';
import {
  decryptJson,
  encryptJson,
  fromBase64Url,
  hkdfBytes,
  importAesKey,
  randomBytes,
  toBase64Url,
  utf8,
} from '@askcalls/crypto';
import {
  ARGON2_DEFAULTS,
  ARGON2_SALT_LENGTH,
  type Argon2Params,
  argon2idBytes,
  assertPassphraseLength,
} from '@askcalls/crypto/passphrase';
import { z } from 'zod';
import { writePrivateFile } from '../config';

const SERVICE = 'askcalls';

type Keyring = typeof import('@napi-rs/keyring');

async function loadKeyring(): Promise<Keyring | null> {
  try {
    return await import('@napi-rs/keyring');
  } catch {
    return null;
  }
}

/**
 * On Linux the store is pinned to the Secret Service: the library's fallback, the kernel keyring,
 * is cleared on reboot, which would silently unlink the agent.
 */
const ENTRY_OPTIONS = { linux: { store: 'secret-service' as const } };

/** Secrets in the OS keychain (macOS Keychain, Windows Credential Manager, Secret Service). */
export class KeychainSecretStore implements SecretStore {
  constructor(
    private readonly keyring: Keyring,
    /** Separates accounts on different servers. */
    private readonly scope: string,
  ) {}

  #entry(name: string) {
    return new this.keyring.AsyncEntry(SERVICE, `${this.scope} ${name}`, ENTRY_OPTIONS);
  }

  async get(name: string): Promise<Uint8Array | null> {
    const v = await this.#entry(name).getSecret();
    return v ? Uint8Array.from(v) : null;
  }

  async set(name: string, value: Uint8Array): Promise<void> {
    await this.#entry(name).setSecret(value);
  }

  async delete(name: string): Promise<void> {
    await this.#entry(name).deleteCredential();
  }
}

/** True when the OS keychain answers a read (a missing entry still counts as available). */
export async function keychainAvailable(keyring: Keyring): Promise<boolean> {
  try {
    await new keyring.AsyncEntry(SERVICE, 'probe', ENTRY_OPTIONS).getSecret();
    return true;
  } catch {
    return false;
  }
}

const FileSchema = z.object({
  v: z.literal(1),
  salt: z.string(),
  memoryKiB: z.number().int(),
  iterations: z.number().int(),
  parallelism: z.number().int(),
  ct: z.string(),
});

const FILE_INFO = 'askcalls/agent/v1/secrets-file';
const FILE_AAD = utf8(FILE_INFO);

type Contents = Record<string, Record<string, string>>;

/**
 * The fallback for computers without an OS keychain (headless Linux, containers): one file,
 * AES-256-GCM under a key derived with Argon2id from a passphrase the user supplies
 * (`ASKCALLS_KEYSTORE_PASSPHRASE`). Only used when no keychain answers, and always reported.
 */
export class EncryptedFileSecretStore implements SecretStore {
  private constructor(
    private readonly path: string,
    private readonly scope: string,
    private readonly key: CryptoKey,
    private readonly kdf: { salt: Uint8Array; params: Argon2Params },
    private contents: Contents,
  ) {}

  static async open(opts: {
    path: string;
    scope: string;
    passphrase: string;
    /** Tests lower the Argon2id cost. */
    params?: Argon2Params;
  }): Promise<EncryptedFileSecretStore> {
    let existing: z.output<typeof FileSchema> | null = null;
    try {
      existing = FileSchema.parse(JSON.parse(await readFile(opts.path, 'utf8')));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`${opts.path} is not a readable askcalls secrets file`);
      }
    }
    if (!existing) assertPassphraseLength(opts.passphrase);
    const salt = existing ? fromBase64Url(existing.salt) : randomBytes(ARGON2_SALT_LENGTH);
    const params = existing
      ? {
          memoryKiB: existing.memoryKiB,
          iterations: existing.iterations,
          parallelism: existing.parallelism,
        }
      : (opts.params ?? ARGON2_DEFAULTS);
    const stretched = await argon2idBytes(opts.passphrase, salt, params);
    const key = await importAesKey(await hkdfBytes(stretched, FILE_INFO));
    stretched.fill(0);
    let contents: Contents = {};
    if (existing) {
      try {
        contents = await decryptJson<Contents>(key, fromBase64Url(existing.ct), FILE_AAD);
      } catch {
        throw new Error('wrong passphrase for the askcalls secrets file');
      }
    }
    return new EncryptedFileSecretStore(opts.path, opts.scope, key, { salt, params }, contents);
  }

  async get(name: string): Promise<Uint8Array | null> {
    const v = this.contents[this.scope]?.[name];
    return v === undefined ? null : fromBase64Url(v);
  }

  async set(name: string, value: Uint8Array): Promise<void> {
    this.contents = {
      ...this.contents,
      [this.scope]: { ...this.contents[this.scope], [name]: toBase64Url(value) },
    };
    await this.#flush();
  }

  async delete(name: string): Promise<void> {
    const { [name]: _removed, ...rest } = this.contents[this.scope] ?? {};
    this.contents = { ...this.contents, [this.scope]: rest };
    await this.#flush();
  }

  #flushing: Promise<void> = Promise.resolve();

  /** One write at a time, each with the contents as they are when it starts. */
  #flush(): Promise<void> {
    const next = this.#flushing.catch(() => {}).then(() => this.#write());
    this.#flushing = next;
    return next;
  }

  async #write(): Promise<void> {
    const ct = await encryptJson(this.key, this.contents, FILE_AAD);
    const file: z.input<typeof FileSchema> = {
      v: 1,
      salt: toBase64Url(this.kdf.salt),
      ...this.kdf.params,
      ct: toBase64Url(ct),
    };
    await writePrivateFile(this.path, `${JSON.stringify(file)}\n`);
  }
}

export type SecretStoreKind = 'keychain' | 'encrypted-file';

export class KeychainUnavailableError extends Error {
  constructor(readonly path: string) {
    super(
      [
        'No OS keychain is available on this computer.',
        `askcalls can keep its keys in an encrypted file instead (${path}).`,
        'Set ASKCALLS_KEYSTORE_PASSPHRASE to a passphrase of at least 12 characters, in this shell',
        'and in the "env" of your MCP client configuration, then run the command again.',
      ].join('\n'),
    );
    this.name = 'KeychainUnavailableError';
  }
}

/**
 * The OS keychain when one answers; otherwise the encrypted file, which needs
 * `ASKCALLS_KEYSTORE_PASSPHRASE`. The returned `kind` is shown to the user.
 */
export async function openSecretStore(opts: {
  scope: string;
  filePath: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ store: SecretStore; kind: SecretStoreKind }> {
  const env = opts.env ?? process.env;
  const keyring = env.ASKCALLS_KEYSTORE === 'file' ? null : await loadKeyring();
  if (keyring && (await keychainAvailable(keyring))) {
    return { store: new KeychainSecretStore(keyring, opts.scope), kind: 'keychain' };
  }
  const passphrase = env.ASKCALLS_KEYSTORE_PASSPHRASE;
  if (!passphrase) throw new KeychainUnavailableError(opts.filePath);
  const store = await EncryptedFileSecretStore.open({
    path: opts.filePath,
    scope: opts.scope,
    passphrase,
  });
  return { store, kind: 'encrypted-file' };
}
