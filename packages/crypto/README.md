# @askcalls/crypto

Key hierarchy, AEAD, unlock wrapping, blind-index tokens, ECIES, device signatures and segmented
recording encryption for AskCalls (spec section 6). Isomorphic: WebCrypto (`globalThis.crypto`)
plus `hash-wasm` for Argon2id. No `node:` imports, so it runs unchanged in browsers and Node 20+.

Notation: `‖` is concatenation, `u32be(n)` is 4 bytes big-endian, `i64be(n)` is 8 bytes
big-endian two's complement, `lp(x) = u32be(len(x)) ‖ x`, strings are UTF-8, `∅` is the empty
byte string. HKDF is HKDF-SHA256 (RFC 5869) with a 32-byte output unless stated.

Errors are `CryptoError` (a `DomainError`) with a typed `reason`: `decrypt_failed`, `wrong_key`,
`bad_signature`, `invalid_format`, `invalid_input`, `weak_passphrase`, `invalid_recovery_code`,
`truncated`, `locked`. Messages never contain key material or plaintext.

## Key hierarchy (6.1)

| Key | Derivation | Form in memory |
| --- | --- | --- |
| RK | 32 random bytes | raw bytes inside `UnlockedKeys` (needed to add unlock methods and link devices) |
| KEK | `HKDF(ikm = RK, salt = ∅, info = "askcalls/v1/kek")` | non-extractable AES-256-GCM `CryptoKey` |
| index key | `HKDF(ikm = RK, salt = ∅, info = "askcalls/v1/index")` | non-extractable HMAC-SHA256 `CryptoKey` |
| DEK (per call) | 32 random bytes | non-extractable AES-256-GCM `CryptoKey`; raw bytes wiped after wrapping |

`UnlockedKeys.fromRootKey(rk)` derives the subkeys; `wipe()` zeroes its copy of RK and drops the
CryptoKeys (WebCrypto keys can't be zeroed, only released). After `wipe()` every getter throws
`locked`. Call it on lock (6.8).

## AEAD envelope (6.3)

Every `*Ct` column, `wrappedDek` and `wrappedRootKey`:

```
envelope = version(0x01) ‖ nonce(12, random) ‖ AES-256-GCM ciphertext ‖ tag(16)
```

Overhead is 29 bytes. A 32-byte key wraps to 61 bytes. Version `0x01` means AES-256-GCM with a
96-bit random nonce and a 128-bit tag; any other first byte is `invalid_format`.

Note: spec 6.1 writes `wrappedDek` as `nonce‖AES-GCM(KEK, DEK)`. We store the same thing with the
version byte in front, like every other ciphertext.

### AAD

```
aad(userId, callId, field) = lp(userId) ‖ lp(callId) ‖ lp(field)
```

Length prefixes make it injective. Non-call data uses `callId = ""`. Build field names with
`AadFields`:

| Data | Key | `callId` | `field` |
| --- | --- | --- | --- |
| `Call.transcriptCt` | DEK | call id | `transcript` |
| `Call.metaCt` | DEK | call id | `meta` |
| `CallChunk.snippetCt` | DEK | call id | `snippet:<ord>` |
| `Call.wrappedDek` | KEK | call id | `dek` |
| recording blob (base AAD) | DEK | call id | `recording` |
| `UserData.ct` | KEK | `""` | `userdata:<kind>` |
| `VocabDelta.ct` | KEK | `""` | `vocab:<seq>` |
| `UserKeys.inboxPrivateKeyCt` | KEK | `""` | `inbox-private-key` |
| `InboxItem` payload | ECIES | `""` | `inbox-item` |
| `DeviceLinkSession.encryptedRootKey` | ECIES | `""` | `device-link` |
| `Keyring.wrappedRootKey` | wrapKey | `""` | `rootkey:<kind>` |

`encryptJson`/`decryptJson` wrap `JSON.stringify`/`JSON.parse` around UTF-8; validate the parsed
value with the domain's zod schema.

## Unlock methods (6.2)

`wrappedRootKey = envelope(wrapKey, RK, aad(userId, "", "rootkey:<kind>"))`. `kdfParams` is JSON
with byte values as unpadded base64url. A failed unwrap is always `wrong_key`.

| kind | wrapKey | `kdfParams` |
| --- | --- | --- |
| `passkey` | `HKDF(ikm = PRF output (32), salt = ∅, info = "askcalls/v1/wrap/passkey")` | `{ v: 1, kdf: "webauthn-prf+hkdf", prfSalt }` |
| `recovery` | `HKDF(ikm = code bytes (20), salt, info = "askcalls/v1/wrap/recovery")` | `{ v: 1, kdf: "hkdf", salt }` (16 bytes) |
| `passphrase` | `HKDF(ikm = Argon2id(NFC(pass), salt, m, t, p, 32), salt = ∅, info = "askcalls/v1/wrap/passphrase")` | `{ v: 1, kdf: "argon2id+hkdf", salt, memoryKiB, iterations, parallelism }` |
| `device` | `HKDF(ikm = local secret (32), salt, info = "askcalls/v1/wrap/device")` | `{ v: 1, kdf: "device-secret+hkdf", salt }` (16 bytes) |

- **Passkey:** the PRF salt is `PRF_SALT = sha256("askcalls/v1/prf")`
  = `1da109c9…544be63`. Pass it as `extensions.prf.eval.first` and give the 32-byte result to
  `createPasskeyEntry` / `unlockWithPasskey`.
- **Recovery code:** 20 random bytes (160 bits, above the spec's 128-bit minimum), Crockford
  base32 (`0-9 A-Z` without `I L O U`), 8 groups of 4: 8 × 4 × 5 = 160 bits exactly, so there is
  no padding and every character is random. Parsing drops spaces, dashes, underscores and
  newlines, ignores case, and reads `O` as `0` and `I`/`L` as `1`. There is **no checksum**: a
  typo just fails the unwrap (the GCM tag is the check), and onboarding confirms the code by
  having the user retype two groups (`pickConfirmationGroups`, `checkConfirmationGroups`).
- **Passphrase:** Argon2id with m = 64 MiB, t = 3, p = 1, a 16-byte salt and a 32-byte output
  (`ARGON2_DEFAULTS`). The passphrase is NFC-normalized and must have at least 12 code points
  (`weak_passphrase` otherwise). Stored params are bounds-checked before use (≤ 1 GiB, ≤ 64
  iterations, ≤ 16 lanes). `estimatePassphraseStrength` gives a 0–4 score, a bit estimate and
  warning keys for the meter.
- **Device:** a 32-byte random secret kept in the OS keychain (agent) wraps RK locally.

## Blind-index tokens (6.4)

```
token(kind, value) = i64be⁻¹( HMAC-SHA256(indexKey, utf8(kind) ‖ 0x00 ‖ value)[0..8] )
```

The first 8 bytes are read big-endian as a **signed** 64-bit integer (a `bigint`, can be
negative; Postgres `bigint`). `value` is the UTF-8 bytes of a string, or raw bytes:

| kind | value passed |
| --- | --- |
| `w` | normalized keyword (string) |
| `c` | E.164 phone (string) |
| `t` | tag id (string) |
| `a` | 32 raw bytes: SHA-256 of decoded 16 kHz mono PCM (or of the file) |
| `x` | 32 raw bytes: SHA-256 of the normalized transcript; `contentToken(key, text)` does it |

`tokens()` maps a list in order; `tokenSet()` dedupes and sorts ascending (for `keywordToks`,
`tagToks`).

## ECIES (6.5, 6.7)

```
ciphertext = ephemeralPublicKey(65, uncompressed P-256 point, starts 0x04) ‖ envelope
key        = HKDF(ikm = ECDH(ephemeral, recipient).x (32), salt = ephemeralPublicKey,
                  info = "askcalls/v1/ecies")
```

`envelope` is the AEAD envelope above under `key` with the caller's AAD. Overhead: 94 bytes.
Public keys travel as SPKI. `splitEcies` / `joinEcies` separate the ephemeral key and the
payload for `InboxItem.ephemeralPublicKey` / `payloadCt`.

- Inbox: `generateInboxKeyPair(kek, userId)` returns the SPKI public key, the non-extractable
  private key and `privateKeyCt = envelope(KEK, PKCS#8, aad(userId, "", "inbox-private-key"))`.
  The server calls `encryptToInbox(inboxPublicKey, userId, payload)`.
- Device link: `encryptRootKeyForDevice(devicePublicKey, userId, RK)` /
  `decryptRootKeyFromLink(privateKey, userId, ct)`.

## Device-link fingerprint

```
m      = utf8("askcalls/v1/fingerprint") ‖ 0x00 ‖ spki
digest = HMAC-SHA256(linkSecret, m)      (keyed, recommended)
       | SHA-256(m)                      (unkeyed)
code   = (u64be(digest[0..8]) mod 10^6), zero-padded to 6 digits
```

Six digits are ~20 bits. Whoever relays the joiner's key could grind ~10^6 key pairs to match an
unkeyed fingerprint, so pass the one-time link secret (known to both devices, stored only hashed
on the server) as `linkSecret`.

## Device signatures (6.6)

ECDSA P-256 / SHA-256, signature = IEEE P1363 `r ‖ s` (64 bytes). The signed message is

```
sha256( lp(utf8(callId)) ‖ i64be(contentTok) ‖ sha256(transcriptPlaintext) )
```

where `transcriptPlaintext` is the exact byte string encrypted into `transcriptCt` (a string
argument is taken as UTF-8). Public keys are SPKI. Browsers keep the non-extractable private
key; the agent generates with `extractable: true` and stores PKCS#8.

## Recordings (6.3)

```
header    = version(0x01) ‖ u32be(segmentSize) ‖ noncePrefix(8, random)          13 bytes
segment_i = AES-256-GCM(DEK, nonce_i, plaintext_i, aad_i)                          ct ‖ tag(16)
nonce_i   = noncePrefix ‖ u32be(i)
aad_i     = header ‖ baseAad ‖ u32be(i) ‖ u8(final)
blob      = header ‖ segment_0 ‖ … ‖ segment_{n-1}
```

Default `segmentSize` is 1 MiB (accepted range 1 B – 16 MiB). All segments but the last are full;
the last holds 0..segmentSize bytes and is the only one with `final = 1`; an empty recording is
one empty final segment. So `n = max(1, ceil(len / segmentSize))` and
`size = 13 + len + 16·n` (`encryptedRecordingSize`), known before the presigned PUT.
`baseAad = aad(userId, callId, "recording")`.

Reordering, duplication, truncation (at or inside a segment) and appended data all fail
authentication. Decryption streams: plaintext of earlier segments is yielded before a later
segment fails, so treat output as unverified until the iterator completes.

API: `encryptRecordingStream` / `decryptRecordingStream` take an `AsyncIterable`, `Iterable` or
`ReadableStream` of `Uint8Array` and return an async generator; `toReadableStream` adapts one
for `fetch`. `encryptRecording` / `decryptRecording` work on whole buffers.

## Hashing

`sha256(bytes)`, `sha256Text(text)` (UTF-8, no normalization: packages/indexing normalizes),
`hkdfBytes(ikm, info, length, salt)`.

## Test vectors

`test/vectors.json` is produced by `bun packages/crypto/test/generate-vectors.ts`, which uses
node:crypto (independent of this package's WebCrypto code) and fixed inputs: RK = `00..1f`,
DEK = `20..3f`, fixed nonces, P-256 keys with `d = sha256("askcalls/test/<name>")`, small
Argon2 params from hash-wasm. `src/vectors.test.ts` checks this package reproduces or opens
every vector. Re-running the script yields the same file except the (randomized) ECDSA signature.
