import { buf, concat, subtle, utf8 } from './bytes';
import { CryptoError } from './errors';
import { sha256 } from './hash';

/**
 * Device-link fingerprint (spec 6.5): six decimal digits both devices show for the joiner's
 * public key.
 *
 * `m = utf8("askcalls/v1/fingerprint") ‖ 0x00 ‖ spki`
 * - keyed (recommended): `digest = HMAC-SHA256(key = linkSecret, m)`
 * - unkeyed: `digest = SHA-256(m)`
 *
 * The first 8 bytes of `digest` are read as an unsigned big-endian 64-bit integer, reduced
 * mod 10^6 and left-padded with zeros (bias below 10^-13).
 *
 * Six digits are only ~20 bits: whoever relays the public key could grind about 10^6 key pairs
 * (seconds of work) until one matches the unkeyed fingerprint. Keying it with the one-time link
 * secret from the code / QR, which both devices know and the server only stores hashed, removes
 * that option. Pass `linkSecret` whenever it is available.
 */
export const FINGERPRINT_INFO = 'askcalls/v1/fingerprint';

export async function publicKeyFingerprint(
  spki: Uint8Array,
  linkSecret?: Uint8Array,
): Promise<string> {
  const message = concat(utf8(FINGERPRINT_INFO), Uint8Array.of(0), spki);
  let digest: Uint8Array<ArrayBuffer>;
  if (linkSecret) {
    if (linkSecret.length < 16) throw new CryptoError('invalid_input', 'link secret too short');
    const key = await subtle().importKey(
      'raw',
      buf(linkSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    digest = new Uint8Array(await subtle().sign('HMAC', key, message));
  } else {
    digest = await sha256(message);
  }
  const n = new DataView(digest.buffer).getBigUint64(0, false) % 1_000_000n;
  return n.toString().padStart(6, '0');
}
