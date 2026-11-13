import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SetupToken } from './setup-token';

describe('setup token', () => {
  it('prints the token, saves it owner-only and accepts it in any case or spacing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'askcalls-setup-'));
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const token = await new SetupToken(dir).issue('http://localhost:3000');
    const printed = write.mock.calls.map((c) => String(c[0])).join('');
    write.mockRestore();
    expect(token).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    expect(printed).toContain(token);
    expect(printed).toContain('http://localhost:3000/setup');
    const file = join(dir, 'setup-token');
    expect((await readFile(file, 'utf8')).trim()).toBe(token);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it('is single use: consuming removes the file and every later attempt fails', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'askcalls-setup-'));
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const t = new SetupToken(dir);
    const token = await t.issue('http://localhost:3000');
    write.mockRestore();
    expect(t.verify(token)).toBe(true);
    expect(t.verify(token.toLowerCase().replaceAll('-', ' '))).toBe(true);
    expect(t.verify(`${token.slice(0, -1)}0`)).toBe(token.endsWith('0'));
    expect(t.verify('')).toBe(false);
    await t.consume();
    expect(t.verify(token)).toBe(false);
    await expect(stat(join(dir, 'setup-token'))).rejects.toThrow();
  });

  it('differs on every boot', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'askcalls-setup-'));
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const a = await new SetupToken(dir).issue('http://localhost:3000');
    const b = await new SetupToken(dir).issue('http://localhost:3000');
    write.mockRestore();
    expect(a).not.toBe(b);
  });
});
