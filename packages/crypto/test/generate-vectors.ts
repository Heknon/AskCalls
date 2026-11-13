/**
 * Regenerates test/vectors.json:  bun packages/crypto/test/generate-vectors.ts
 *
 * The vectors are computed with node:crypto (an implementation independent of this package's
 * WebCrypto code) from fixed inputs, following the byte formats in README.md. Every secret input
 * is derived from a label, e.g. `rootKey = 0x00..0x1f`, `d = sha256("askcalls/test/<name>")`.
 * Argon2id comes from hash-wasm (node:crypto has no Argon2 in Node 20). ECDSA signatures are
 * randomized, so the signature vector is verified, not reproduced.
 *
 * The output is stable: running the script again produces the same file, except for the
 * ECDSA signature bytes.
 */
import {
  createCipheriv,
  createECDH,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  hkdfSync,
  sign,
} from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { argon2id } from 'hash-wasm';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const seq = (start: number, length: number) =>
  Buffer.from(Array.from({ length }, (_, i) => (start + i) & 0xff));
const sha256 = (b: Uint8Array | string) => createHash('sha256').update(b).digest();
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const lp = (s: string | Uint8Array) => {
  const b = Buffer.from(s);
  return Buffer.concat([u32(b.length), b]);
};
const hkdf = (ikm: Uint8Array, info: string | Uint8Array, salt: Uint8Array = Buffer.alloc(0)) =>
  Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from(info), 32));
const aad = (userId: string, callId: string, field: string) =>
  Buffer.concat([lp(userId), lp(callId), lp(field)]);
const gcm = (key: Uint8Array, nonce: Uint8Array, pt: Uint8Array, ad: Uint8Array) => {
  const c = createCipheriv('aes-256-gcm', key, nonce);
  c.setAAD(ad);
  return Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
};
const envelope = (key: Uint8Array, nonce: Uint8Array, pt: Uint8Array, ad: Uint8Array) =>
  Buffer.concat([Buffer.of(1), nonce, gcm(key, nonce, pt, ad)]);
const b64url = (b: Uint8Array) => Buffer.from(b).toString('base64url');

function p256(name: string) {
  const d = sha256(`askcalls/test/${name}`);
  const ecdh = createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  const raw = ecdh.getPublicKey();
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: b64url(d),
    x: b64url(raw.subarray(1, 33)),
    y: b64url(raw.subarray(33, 65)),
  };
  const priv = createPrivateKey({ key: jwk, format: 'jwk' });
  return {
    d,
    raw,
    ecdh,
    priv,
    pkcs8: priv.export({ format: 'der', type: 'pkcs8' }),
    spki: createPublicKey(priv).export({ format: 'der', type: 'spki' }),
  };
}

const userId = 'user-1';
const callId = '0190b7e6-3c5a-7cc0-8000-000000000001';

// Key hierarchy
const rootKey = seq(0x00, 32);
const kek = hkdf(rootKey, 'askcalls/v1/kek');
const indexKey = hkdf(rootKey, 'askcalls/v1/index');

// AAD and AEAD
const transcriptAad = aad(userId, callId, 'transcript');
const aeadNonce = seq(0xa0, 12);
const aeadPlaintext = Buffer.from('{"text":"hello askcalls","segments":[]}');

// DEK
const dek = seq(0x20, 32);
const dekAad = aad(userId, callId, 'dek');
const wrappedDek = envelope(kek, seq(0xb0, 12), dek, dekAad);
const transcriptCt = envelope(dek, aeadNonce, aeadPlaintext, transcriptAad);

// Tokens
const tokenInputs: Array<{ kind: string; value: string | Buffer; valueHex?: boolean }> = [
  { kind: 'w', value: 'invoice' },
  { kind: 'w', value: 'שלום' },
  { kind: 'w', value: '' },
  { kind: 'c', value: '+14155550123' },
  { kind: 't', value: 'tag_01j9zq' },
  { kind: 'a', value: sha256('pcm'), valueHex: true },
  { kind: 'x', value: sha256('hello world'), valueHex: true },
];
const tokenVectors = tokenInputs.map(({ kind, value, valueHex }) => {
  const mac = createHmac('sha256', indexKey)
    .update(Buffer.concat([Buffer.from(kind), Buffer.of(0), Buffer.from(value)]))
    .digest();
  return {
    kind,
    ...(valueHex ? { valueHex: hex(value as Buffer) } : { value: value as string }),
    token: mac.readBigInt64BE(0).toString(),
  };
});

// Recovery code: Crockford base32 of 20 bytes
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const recoveryBytes = seq(0x10, 20);
let bits = '';
for (const b of recoveryBytes) bits += b.toString(2).padStart(8, '0');
let chars = '';
for (let i = 0; i < bits.length; i += 5)
  chars += ALPHABET[Number.parseInt(bits.slice(i, i + 5), 2)];
const recoveryCode = chars.match(/.{4}/g)!.join('-');
const recoverySalt = seq(0xc0, 16);
const recoveryWrapKey = hkdf(recoveryBytes, 'askcalls/v1/wrap/recovery', recoverySalt);
const rootKeyAad = (kind: string) => aad(userId, '', `rootkey:${kind}`);

// Passkey
const prfOutput = seq(0x40, 32);
const passkeyWrapKey = hkdf(prfOutput, 'askcalls/v1/wrap/passkey');

// Passphrase (small Argon2 params so the test is fast)
const passphrase = 'correct horse battery staple';
const passphraseSalt = seq(0xd0, 16);
const argonParams = { memoryKiB: 256, iterations: 2, parallelism: 1 };
const stretched = await argon2id({
  password: passphrase.normalize('NFC'),
  salt: passphraseSalt,
  memorySize: argonParams.memoryKiB,
  iterations: argonParams.iterations,
  parallelism: argonParams.parallelism,
  hashLength: 32,
  outputType: 'binary',
});
const passphraseWrapKey = hkdf(stretched, 'askcalls/v1/wrap/passphrase');

// Device secret
const deviceSecret = seq(0x60, 32);
const deviceSalt = seq(0xe0, 16);
const deviceWrapKey = hkdf(deviceSecret, 'askcalls/v1/wrap/device', deviceSalt);

// ECIES: device link, recipient and ephemeral keys derived from labels
const recipient = p256('recipient');
const ephemeral = p256('ephemeral');
const shared = ephemeral.ecdh.computeSecret(recipient.raw);
const eciesKey = hkdf(shared, 'askcalls/v1/ecies', ephemeral.raw);
const deviceLinkCt = Buffer.concat([
  ephemeral.raw,
  envelope(eciesKey, seq(0xf0, 12), rootKey, aad(userId, '', 'device-link')),
]);

// Signing
const signer = p256('signer');
const contentTok = -1234567890123456789n;
const tok = Buffer.alloc(8);
tok.writeBigInt64BE(contentTok);
const signatureMessage = sha256(Buffer.concat([lp(callId), tok, sha256(aeadPlaintext)]));
const signature = sign('sha256', signatureMessage, { key: signer.priv, dsaEncoding: 'ieee-p1363' });

// Fingerprint
const fpMessage = Buffer.concat([
  Buffer.from('askcalls/v1/fingerprint'),
  Buffer.of(0),
  recipient.spki,
]);
const fingerprint = (digest: Buffer) =>
  (digest.readBigUInt64BE(0) % 1_000_000n).toString().padStart(6, '0');
const linkSecret = seq(0x70, 32);

// Recording: 8-byte segments, 20-byte plaintext → 3 segments (8, 8, 4)
const recordingPlain = Buffer.from('ogg-opus-sample-data');
const segmentSize = 8;
const prefix = seq(0x90, 8);
const header = Buffer.concat([Buffer.of(1), u32(segmentSize), prefix]);
const recordingAad = aad(userId, callId, 'recording');
const recordingParts: Buffer[] = [header];
const nSeg = Math.max(1, Math.ceil(recordingPlain.length / segmentSize));
for (let i = 0; i < nSeg; i++) {
  const final = i === nSeg - 1;
  const pt = recordingPlain.subarray(i * segmentSize, (i + 1) * segmentSize);
  const nonce = Buffer.concat([prefix, u32(i)]);
  const ad = Buffer.concat([header, recordingAad, u32(i), Buffer.of(final ? 1 : 0)]);
  recordingParts.push(gcm(dek, nonce, pt, ad));
}

const vectors = {
  description:
    'Generated by packages/crypto/test/generate-vectors.ts with node:crypto from fixed inputs.',
  userId,
  callId,
  hierarchy: { rootKey: hex(rootKey), kek: hex(kek), indexKey: hex(indexKey) },
  aad: {
    transcript: hex(transcriptAad),
    dek: hex(dekAad),
    inboxPrivateKey: hex(aad(userId, '', 'inbox-private-key')),
  },
  aead: {
    key: hex(dek),
    nonce: hex(aeadNonce),
    plaintextUtf8: aeadPlaintext.toString('utf8'),
    aad: hex(transcriptAad),
    envelope: hex(transcriptCt),
  },
  dek: { dek: hex(dek), wrappedDek: hex(wrappedDek) },
  tokens: tokenVectors,
  contentToken: { normalizedText: 'hello world', token: tokenVectors.at(-1)!.token },
  prfSalt: hex(sha256('askcalls/v1/prf')),
  recovery: {
    bytes: hex(recoveryBytes),
    code: recoveryCode,
    kdfParams: { v: 1, kdf: 'hkdf', salt: b64url(recoverySalt) },
    wrappedRootKey: hex(envelope(recoveryWrapKey, seq(0xb1, 12), rootKey, rootKeyAad('recovery'))),
  },
  passkey: {
    prfOutput: hex(prfOutput),
    kdfParams: { v: 1, kdf: 'webauthn-prf+hkdf', prfSalt: b64url(sha256('askcalls/v1/prf')) },
    wrappedRootKey: hex(envelope(passkeyWrapKey, seq(0xb2, 12), rootKey, rootKeyAad('passkey'))),
  },
  passphrase: {
    passphrase,
    argon2id: hex(stretched),
    kdfParams: { v: 1, kdf: 'argon2id+hkdf', salt: b64url(passphraseSalt), ...argonParams },
    wrappedRootKey: hex(
      envelope(passphraseWrapKey, seq(0xb3, 12), rootKey, rootKeyAad('passphrase')),
    ),
  },
  device: {
    deviceSecret: hex(deviceSecret),
    kdfParams: { v: 1, kdf: 'device-secret+hkdf', salt: b64url(deviceSalt) },
    wrappedRootKey: hex(envelope(deviceWrapKey, seq(0xb4, 12), rootKey, rootKeyAad('device'))),
  },
  ecies: {
    recipientPkcs8: hex(recipient.pkcs8),
    recipientSpki: hex(recipient.spki),
    deviceLinkCiphertext: hex(deviceLinkCt),
  },
  signing: {
    publicKeySpki: hex(signer.spki),
    privateKeyPkcs8: hex(signer.pkcs8),
    contentTok: contentTok.toString(),
    transcriptPlaintextUtf8: aeadPlaintext.toString('utf8'),
    message: hex(signatureMessage),
    signature: hex(signature),
  },
  fingerprint: {
    spki: hex(recipient.spki),
    unkeyed: fingerprint(sha256(fpMessage)),
    linkSecret: hex(linkSecret),
    keyed: fingerprint(createHmac('sha256', linkSecret).update(fpMessage).digest()),
  },
  recording: {
    dek: hex(dek),
    segmentSize,
    noncePrefix: hex(prefix),
    baseAad: hex(recordingAad),
    plaintextUtf8: recordingPlain.toString('utf8'),
    ciphertext: hex(Buffer.concat(recordingParts)),
  },
};

writeFileSync(new URL('./vectors.json', import.meta.url), `${JSON.stringify(vectors, null, 2)}\n`);
console.log('wrote test/vectors.json');
