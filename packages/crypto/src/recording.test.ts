import { describe, expect, it } from 'vitest';
import { AadFields, aad } from './aad';
import { importAesKey } from './aead';
import { concat, randomBytes } from './bytes';
import { isCryptoError } from './errors';
import {
  DEFAULT_SEGMENT_SIZE,
  decryptRecording,
  decryptRecordingStream,
  encryptedRecordingSize,
  encryptRecording,
  encryptRecordingStream,
  RECORDING_HEADER_LENGTH,
  recordingPlaintextSize,
  toReadableStream,
} from './recording';

const baseAad = aad({ userId: 'u1', callId: 'c1', field: AadFields.recording });
const S = 64;
const RECORD = S + 16;

const dek = () => importAesKey(randomBytes(32));

async function collect(it: AsyncIterable<Uint8Array>) {
  const parts: Uint8Array[] = [];
  for await (const p of it) parts.push(p);
  return concat(...parts);
}

/** Split bytes into irregular chunks to exercise buffering. */
function* chunked(bytes: Uint8Array, sizes = [1, 7, 33, 100, 3]) {
  let i = 0;
  let k = 0;
  while (i < bytes.length) {
    const n = sizes[k++ % sizes.length]!;
    yield bytes.subarray(i, i + n);
    i += n;
  }
}

const fails = async (key: CryptoKey, ct: Uint8Array) => {
  const e = await decryptRecording(key, ct, baseAad).then(
    () => null,
    (err: unknown) => err,
  );
  expect(isCryptoError(e, 'decrypt_failed') || isCryptoError(e, 'truncated')).toBe(true);
};

describe('segmented recording encryption', () => {
  it('round-trips every length around segment boundaries, with the predicted size', async () => {
    const key = await dek();
    for (const len of [0, 1, S - 1, S, S + 1, 2 * S, 2 * S + 5, 5 * S]) {
      const pt = randomBytes(len);
      const ct = await encryptRecording(key, pt, baseAad, { segmentSize: S });
      expect(ct.length).toBe(encryptedRecordingSize(len, S));
      expect(recordingPlaintextSize(ct.length, S)).toBe(len);
      expect(await decryptRecording(key, ct, baseAad)).toEqual(pt);
    }
  });

  it('streams from irregular chunks and ReadableStreams in both directions', async () => {
    const key = await dek();
    const pt = randomBytes(10 * S + 17);
    const ct = await collect(encryptRecordingStream(key, chunked(pt), baseAad, { segmentSize: S }));
    expect(ct.length).toBe(encryptedRecordingSize(pt.length, S));
    const stream = toReadableStream(
      (async function* () {
        yield* chunked(ct, [5, 90, 2, 300]);
      })(),
    );
    expect(await collect(decryptRecordingStream(key, stream, baseAad))).toEqual(pt);
    const viaStream = await collect(
      encryptRecordingStream(
        key,
        toReadableStream(
          (async function* () {
            yield pt;
          })(),
        ),
        baseAad,
        { segmentSize: S },
      ),
    );
    expect(await decryptRecording(key, viaStream, baseAad)).toEqual(pt);
  });

  it('uses 1 MiB segments by default', async () => {
    const key = await dek();
    const pt = randomBytes(DEFAULT_SEGMENT_SIZE + 10);
    const ct = await encryptRecording(key, pt, baseAad);
    expect(ct.length).toBe(RECORDING_HEADER_LENGTH + pt.length + 2 * 16);
    expect(await decryptRecording(key, ct, baseAad)).toEqual(pt);
    expect(encryptedRecordingSize(0)).toBe(RECORDING_HEADER_LENGTH + 16);
  });

  it('detects truncation at and inside segments', async () => {
    const key = await dek();
    const ct = await encryptRecording(key, randomBytes(3 * S + 10), baseAad, { segmentSize: S });
    const body = RECORDING_HEADER_LENGTH;
    await fails(key, ct.subarray(0, body + 2 * RECORD)); // drop the final segment
    await fails(key, ct.subarray(0, body + RECORD)); // keep only the first
    await fails(key, ct.subarray(0, ct.length - 1)); // cut inside the final segment
    await fails(key, ct.subarray(0, body + 5)); // less than a tag
    await fails(key, ct.subarray(0, body)); // header only
    await fails(key, ct.subarray(0, 4)); // partial header
  });

  it('detects reordering and duplicated segments', async () => {
    const key = await dek();
    const ct = await encryptRecording(key, randomBytes(3 * S + 10), baseAad, { segmentSize: S });
    const header = ct.subarray(0, RECORDING_HEADER_LENGTH);
    const seg = (i: number) =>
      ct.subarray(RECORDING_HEADER_LENGTH + i * RECORD, RECORDING_HEADER_LENGTH + (i + 1) * RECORD);
    await fails(key, concat(header, seg(1), seg(0), seg(2), seg(3)));
    await fails(key, concat(header, seg(0), seg(0), seg(2), seg(3)));
  });

  it('detects extension after the final segment', async () => {
    const key = await dek();
    const pt = randomBytes(2 * S + 3);
    const ct = await encryptRecording(key, pt, baseAad, { segmentSize: S });
    await fails(key, concat(ct, new Uint8Array(1)));
    await fails(key, concat(ct, randomBytes(RECORD)));
    // Splice the final segment of another, longer recording under the same key.
    const longer = await encryptRecording(key, randomBytes(4 * S), baseAad, { segmentSize: S });
    await fails(key, concat(ct, longer.subarray(RECORDING_HEADER_LENGTH + 3 * RECORD)));
  });

  it('detects a modified header, any flipped byte, wrong key and wrong AAD', async () => {
    const key = await dek();
    const ct = await encryptRecording(key, randomBytes(2 * S + 1), baseAad, { segmentSize: S });
    for (let i = 0; i < ct.length; i++) {
      const bad = new Uint8Array(ct);
      bad[i]! ^= 0x04;
      await expect(decryptRecording(key, bad, baseAad)).rejects.toThrow();
    }
    await fails(await dek(), ct);
    await expect(
      decryptRecording(key, ct, aad({ userId: 'u1', callId: 'c2', field: AadFields.recording })),
    ).rejects.toSatisfy((e) => isCryptoError(e, 'decrypt_failed'));
  });

  it('validates options', async () => {
    const key = await dek();
    await expect(
      encryptRecording(key, randomBytes(1), baseAad, { segmentSize: 0 }),
    ).rejects.toThrow();
    await expect(
      encryptRecording(key, randomBytes(1), baseAad, { noncePrefix: randomBytes(4) }),
    ).rejects.toThrow();
    expect(() => encryptedRecordingSize(-1)).toThrow();
    expect(() => recordingPlaintextSize(RECORDING_HEADER_LENGTH + 3, S)).toThrow();
  });
});
