import { describe, expect, it } from 'vitest';
import { FakeGoogle } from '../testing/fake-google';
import { DriveImport, driveRef } from './drive';
import { pairFiles } from './pairing';

const FOLDER = 'application/vnd.google-apps.folder';
const bytes = (s: string) => new TextEncoder().encode(s);

function setup(now = () => 0) {
  const google = new FakeGoogle({
    grantScope: 'https://www.googleapis.com/auth/drive.readonly',
  });
  const drive = new DriveImport({ fetch: google.fetch, now });
  const { accessToken } = google.issue();
  drive.connect({ accessToken, expiresInSec: 3600 });
  return { google, drive };
}

describe('DriveImport', () => {
  it('lists a folder: folders first, only files the import reads', async () => {
    const { google, drive } = setup();
    const calls = google.addFile({ name: 'Calls', mimeType: FOLDER });
    google.addFile({ name: 'a.m4a', bytes: bytes('audio') });
    google.addFile({ name: 'notes', mimeType: 'application/vnd.google-apps.document' });
    google.addFile({ name: 'photo.jpg' });
    google.addFile({ name: 'export.zip' });
    google.addFile({ name: 'a.txt', parents: [calls] });

    const { entries, nextPageToken } = await drive.list();
    expect(nextPageToken).toBeNull();
    expect(entries.map((e) => [e.name, e.kind, e.size])).toEqual([
      ['Calls', 'folder', 0],
      ['a.m4a', 'audio', 5],
      ['export.zip', 'zip', 0],
    ]);
    expect((await drive.list(calls)).entries.map((e) => e.name)).toEqual(['a.txt']);
    await expect(drive.list("x' or '1")).rejects.toThrow('unknown folder');
  });

  it('collects folder trees under the folder name, so pairing works as with a local folder', async () => {
    const { google, drive } = setup();
    const calls = google.addFile({ name: 'Calls', mimeType: FOLDER });
    const may = google.addFile({ name: 'May', mimeType: FOLDER, parents: [calls] });
    google.addFile({ name: 'x.m4a', parents: [may], bytes: bytes('aa') });
    google.addFile({ name: 'x.txt', parents: [may], bytes: bytes('hello') });
    google.addFile({ name: 'y.mp3', parents: [calls], bytes: bytes('b') });
    google.addFile({ name: 'all.zip', parents: [calls] });
    const loose = google.addFile({ name: 'z.wav', bytes: bytes('ccc') });

    const top = (await drive.list()).entries;
    const { files, zips } = await drive.collect(top);
    expect(files.map((f) => f.name).sort()).toEqual([
      'Calls/May/x.m4a',
      'Calls/May/x.txt',
      'Calls/y.mp3',
      'z.wav',
    ]);
    expect(zips.map((f) => f.name)).toEqual(['Calls/all.zip']);
    expect(files.find((f) => f.name === 'z.wav')).toEqual({
      ref: driveRef(loose, 'z.wav'),
      name: 'z.wav',
      size: 3,
    });
    const pairing = pairFiles(files);
    expect(pairing.items.find((i) => i.name === 'x')?.transcript?.name).toBe('Calls/May/x.txt');

    const tx = files.find((f) => f.name.endsWith('x.txt'))!;
    expect(new TextDecoder().decode(await drive.bytes(tx))).toBe('hello');
    const audio = await drive.audio(files.find((f) => f.name === 'z.wav')!);
    expect(audio.mimeType).toBe('audio/wav');
  });

  it('pages through large folders', async () => {
    const { google, drive } = setup();
    const big = google.addFile({ name: 'Big', mimeType: FOLDER });
    for (let i = 0; i < 205; i++) {
      google.addFile({ name: `c${String(i).padStart(3, '0')}.mp3`, parents: [big] });
    }
    const first = await drive.list(big);
    expect(first.entries).toHaveLength(200);
    expect(first.nextPageToken).not.toBeNull();
    const { files } = await drive.collect([{ id: big, name: 'Big', kind: 'folder', size: 0 }]);
    expect(files).toHaveLength(205);
  });

  it('asks to connect again once the token expired, was refused or was cleared', async () => {
    let t = 0;
    const { google, drive } = setup(() => t);
    const id = google.addFile({ name: 'a.m4a', bytes: bytes('a') });
    const ref = { ref: driveRef(id, 'a.m4a'), name: 'a.m4a', size: 1 };
    expect(drive.connected()).toBe(true);

    t = 3_550_000;
    expect(drive.connected()).toBe(false);
    await expect(drive.bytes(ref)).rejects.toMatchObject({ code: 'forbidden' });

    t = 0;
    const { accessToken } = google.issue();
    drive.connect({ accessToken, expiresInSec: 3600 });
    google.expireAccessTokens();
    await expect(drive.bytes(ref)).rejects.toMatchObject({ code: 'forbidden' });
    expect(drive.connected()).toBe(false);

    drive.connect({ accessToken: google.issue().accessToken, expiresInSec: 3600 });
    drive.clear();
    await expect(drive.list()).rejects.toMatchObject({ code: 'forbidden' });
    await expect(drive.bytes({ ...ref, ref: 'dir:x:a.m4a' })).rejects.toThrow();
  });

  it('sends only the bearer token: no cookies, no AskCalls origin', async () => {
    const google = new FakeGoogle();
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const drive = new DriveImport({
      fetch: (input, init) => {
        seen.push({ url: input, ...(init && { init }) });
        return google.handle(new Request(input, init));
      },
    });
    drive.connect({ accessToken: google.issue().accessToken, expiresInSec: 3600 });
    await drive.list();
    expect(seen).toHaveLength(1);
    expect(new URL(seen[0]!.url).origin).toBe('https://www.googleapis.com');
    expect(seen[0]!.init?.credentials).toBe('omit');
    expect(new Headers(seen[0]!.init?.headers).get('authorization')).toMatch(/^Bearer ya29\./);
  });
});
