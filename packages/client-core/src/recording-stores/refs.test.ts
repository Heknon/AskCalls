import { describe, expect, it } from 'vitest';
import { type Providers, ProvidersDocSchema } from '../userdata';
import { forgetStore, switchRecordings } from './choice';
import { withDriveFolder } from './google-drive';
import { movable } from './move';
import { activeStoreRef, driveRef, knownStores } from './refs';

const bucket = {
  id: 'b1',
  endpoint: 'https://s3.example.test',
  bucket: 'calls',
  region: '',
  accessKeyId: 'AK',
  secretAccessKey: 'SK',
};
const drive = { id: 'd1', refreshToken: 'rt', folderId: null };
const base = (): Providers => ProvidersDocSchema.parse({ v: 1 });

describe('recording store refs', () => {
  it('reads documents saved before Drive existed', () => {
    const old = ProvidersDocSchema.parse({ v: 1, recordings: { mode: 'own', bucket } });
    expect(old.previousStores).toEqual([]);
    expect(activeStoreRef(old)).toBe('b1');
    expect(knownStores(old).map((s) => s.ref)).toEqual(['b1']);
  });

  it('keeps the store switched away from, so its recordings stay readable', () => {
    const own = switchRecordings(base(), { mode: 'own', bucket });
    const onDrive = switchRecordings(own, { mode: 'drive', drive });
    expect(activeStoreRef(onDrive)).toBe('gdrive:d1');
    expect(onDrive.previousStores).toEqual([bucket]);
    const back = switchRecordings(onDrive, { mode: 'own', bucket });
    expect(back.previousStores).toEqual([drive]);
    expect(knownStores(back).map((s) => s.ref)).toEqual(['b1', 'gdrive:d1']);
    expect(activeStoreRef(switchRecordings(back, { mode: 'off' }))).toBeUndefined();
  });

  it('forgets a store, falling back to the instance bucket when it was active', () => {
    const onDrive = switchRecordings(switchRecordings(base(), { mode: 'own', bucket }), {
      mode: 'drive',
      drive,
    });
    const gone = forgetStore(onDrive, driveRef(drive));
    expect(gone.recordings).toEqual({ mode: 'managed' });
    expect(knownStores(forgetStore(gone, 'b1'))).toEqual([]);
  });

  it('records the folder on whichever entry holds the Drive', () => {
    const p = withDriveFolder(switchRecordings(base(), { mode: 'drive', drive }), 'gdrive:d1', 'F');
    expect(p.recordings).toMatchObject({ drive: { folderId: 'F' } });
  });

  it('moves only what this device can read and what is elsewhere', () => {
    const p = switchRecordings(switchRecordings(base(), { mode: 'own', bucket }), {
      mode: 'drive',
      drive,
    });
    const recs = [
      { callId: 'a', bucketRef: null, objectKey: 'k' },
      { callId: 'b', bucketRef: 'b1', objectKey: 'k' },
      { callId: 'c', bucketRef: 'gdrive:d1', objectKey: 'k' },
      { callId: 'd', bucketRef: 'forgotten', objectKey: 'k' },
    ];
    expect(movable(p, recs, 'gdrive:d1').map((r) => r.callId)).toEqual(['a', 'b']);
    expect(movable(p, recs, null).map((r) => r.callId)).toEqual(['b', 'c']);
  });
});
