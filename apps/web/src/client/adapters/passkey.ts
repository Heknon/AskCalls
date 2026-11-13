import type { PasskeyAuthenticator } from '@askcalls/client-core/ports/index';
import { fromBase64Url, toBase64Url } from '@askcalls/crypto';
import { DomainError } from '@askcalls/domain';

/**
 * WebAuthn passkeys used only for the PRF extension (spec 6.2): the PRF output unwraps the root
 * key on the device. The server never verifies these credentials, so challenges are random
 * and attestation is not requested.
 */

type PrfResults = { enabled?: boolean; results?: { first?: BufferSource } };

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function prfOutput(cred: PublicKeyCredential): Uint8Array | null {
  const prf = (cred.getClientExtensionResults() as { prf?: PrfResults }).prf;
  const first = prf?.results?.first;
  if (!first) return null;
  const view = ArrayBuffer.isView(first)
    ? new Uint8Array(first.buffer, first.byteOffset, first.byteLength)
    : new Uint8Array(first);
  return new Uint8Array(view);
}

function prfEnabled(cred: PublicKeyCredential): boolean | undefined {
  return (cred.getClientExtensionResults() as { prf?: PrfResults }).prf?.enabled;
}

function asCredential(c: Credential | null): PublicKeyCredential {
  if (c?.type !== 'public-key') throw new DomainError('invalid', 'no passkey was returned');
  return c as PublicKeyCredential;
}

/** WebAuthn reports a cancelled or timed-out prompt as `NotAllowedError`. */
function mapError(e: unknown): never {
  const name = (e as Error)?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') {
    throw new DomainError('forbidden', 'passkey prompt was cancelled');
  }
  if (name === 'InvalidStateError') {
    throw new DomainError('conflict', 'this authenticator already holds a passkey for this site');
  }
  if (name === 'SecurityError') throw new DomainError('invalid', 'passkeys need a secure origin');
  if (name === 'NotSupportedError') throw new DomainError('unsupported', 'passkeys unsupported');
  throw e;
}

export type PrfSupport = 'supported' | 'unsupported' | 'unknown';

/**
 * Whether this browser can evaluate PRF, to decide between offering a passkey and the
 * passphrase fallback. `unknown` means try: `create()` then reports `prfOutput: null` if not.
 */
export async function detectPrfSupport(): Promise<PrfSupport> {
  if (typeof PublicKeyCredential === 'undefined' || !navigator.credentials) return 'unsupported';
  const getCaps = (
    PublicKeyCredential as unknown as {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    }
  ).getClientCapabilities;
  if (getCaps) {
    try {
      const caps = await getCaps.call(PublicKeyCredential);
      if ('extension:prf' in caps) return caps['extension:prf'] ? 'supported' : 'unsupported';
    } catch {
      return 'unknown';
    }
  }
  return 'unknown';
}

export interface WebAuthnPasskeyOptions {
  /** Defaults to `location.hostname`. */
  rpId?: string;
  rpName?: string;
  timeoutMs?: number;
  credentials?: CredentialsContainer;
}

export class WebAuthnPasskeyAuthenticator implements PasskeyAuthenticator {
  readonly rpId: string;
  private readonly rpName: string;
  private readonly timeout: number;
  private readonly container: () => CredentialsContainer;

  constructor(opts: WebAuthnPasskeyOptions = {}) {
    this.rpId = opts.rpId ?? location.hostname;
    this.rpName = opts.rpName ?? 'AskCalls';
    this.timeout = opts.timeoutMs ?? 120_000;
    this.container = () => opts.credentials ?? navigator.credentials;
  }

  async create(opts: {
    userName: string;
    prfSalt: Uint8Array;
  }): Promise<{ credentialId: string; prfOutput: Uint8Array | null }> {
    const salt = new Uint8Array(opts.prfSalt);
    let cred: PublicKeyCredential;
    try {
      cred = asCredential(
        await this.container().create({
          publicKey: {
            rp: { id: this.rpId, name: this.rpName },
            // A random handle per passkey: two passkeys on one authenticator never overwrite
            // each other, and the handle carries no account identifier.
            user: { id: random(32), name: opts.userName, displayName: opts.userName },
            challenge: random(32),
            pubKeyCredParams: [
              { type: 'public-key', alg: -7 },
              { type: 'public-key', alg: -257 },
            ],
            authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
            attestation: 'none',
            timeout: this.timeout,
            extensions: { prf: { eval: { first: salt } } } as AuthenticationExtensionsClientInputs,
          },
        }),
      );
    } catch (e) {
      mapError(e);
    }
    const credentialId = toBase64Url(new Uint8Array(cred.rawId));
    let output = prfOutput(cred);
    // Some authenticators only evaluate PRF on assertion; `enabled: true` says it will work.
    if (!output && prfEnabled(cred) === true) {
      output = (await this.assert({ credentialIds: [credentialId], prfSalt: salt })).prfOutput;
    }
    return { credentialId, prfOutput: output };
  }

  async assert(opts: {
    credentialIds: string[];
    prfSalt: Uint8Array;
  }): Promise<{ credentialId: string; prfOutput: Uint8Array }> {
    let cred: PublicKeyCredential;
    try {
      cred = asCredential(
        await this.container().get({
          publicKey: {
            rpId: this.rpId,
            challenge: random(32),
            allowCredentials: opts.credentialIds.map((id) => ({
              type: 'public-key' as const,
              id: fromBase64Url(id),
            })),
            userVerification: 'required',
            timeout: this.timeout,
            extensions: {
              prf: { eval: { first: new Uint8Array(opts.prfSalt) } },
            } as AuthenticationExtensionsClientInputs,
          },
        }),
      );
    } catch (e) {
      mapError(e);
    }
    const output = prfOutput(cred);
    if (!output) throw new DomainError('unsupported', 'this passkey does not support PRF');
    return { credentialId: toBase64Url(new Uint8Array(cred.rawId)), prfOutput: output };
  }
}
