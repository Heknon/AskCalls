import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { GUARD, guarded, isAllowedHost, isLoopbackAddress } from '../../../local-server.mjs';
import { localRequestAllowed } from './local-guard';

const g = globalThis as Record<symbol, unknown>;

afterEach(() => {
  delete g[GUARD];
});

describe('local mode loopback guard (apps/web/local-server.mjs)', () => {
  it('knows loopback socket addresses', () => {
    for (const a of ['127.0.0.1', '127.8.9.10', '::1', '::ffff:127.0.0.1']) {
      expect(isLoopbackAddress(a), a).toBe(true);
    }
    for (const a of ['10.0.0.2', '192.168.1.5', '::ffff:10.0.0.2', 'fe80::1', '128.0.0.1', '']) {
      expect(isLoopbackAddress(a), a).toBe(false);
    }
    expect(isLoopbackAddress(undefined)).toBe(false);
  });

  it('accepts only this server as Host (DNS rebinding)', () => {
    expect(isAllowedHost('localhost:4317', 4317)).toBe(true);
    expect(isAllowedHost('LOCALHOST:4317', 4317)).toBe(true);
    expect(isAllowedHost('127.0.0.1:4317', 4317)).toBe(true);
    expect(isAllowedHost('[::1]:4317', 4317)).toBe(true);
    expect(isAllowedHost('localhost:4318', 4317)).toBe(false);
    expect(isAllowedHost('evil.example:4317', 4317)).toBe(false);
    expect(isAllowedHost('localhost', 4317)).toBe(false);
    expect(isAllowedHost(undefined, 4317)).toBe(false);
  });

  it('drops a request from a non-loopback socket and runs the rest inside the guard', async () => {
    const storage = new AsyncLocalStorage<{ loopback: true }>();
    g[GUARD] = storage;
    const seen: boolean[] = [];
    const handle = guarded(
      (_req, res) => {
        seen.push(localRequestAllowed({ appMode: 'local' }));
        res.end('ok');
      },
      0,
      storage,
    );

    const destroyed: string[] = [];
    const fakeSocket = (remoteAddress: string) =>
      ({ remoteAddress, destroy: () => destroyed.push(remoteAddress) }) as never;
    handle(
      { socket: fakeSocket('192.168.1.20'), headers: { host: 'localhost:0' } } as never,
      {
        end: () => seen.push(true),
      } as never,
    );
    expect(destroyed).toEqual(['192.168.1.20']);
    expect(seen).toEqual([]);

    const server = createServer((req, res) => {
      const port = (server.address() as AddressInfo).port;
      guarded(
        (_r, s) => {
          seen.push(localRequestAllowed({ appMode: 'local' }));
          s.end('ok');
        },
        port,
        storage,
      )(req, res);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const { port } = server.address() as AddressInfo;
    const get = (host: string) =>
      new Promise<number>((resolve, reject) => {
        request({ host: '127.0.0.1', port, headers: { host } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        })
          .on('error', reject)
          .end();
      });
    expect(await get(`localhost:${port}`)).toBe(200);
    expect(await get(`attacker.example:${port}`)).toBe(421);
    server.close();
    expect(seen).toEqual([true]);
  });

  it('fails closed in local mode outside the guard; server mode is unaffected', () => {
    expect(localRequestAllowed({ appMode: 'local' })).toBe(false);
    g[GUARD] = new AsyncLocalStorage();
    expect(localRequestAllowed({ appMode: 'local' })).toBe(false);
    expect(localRequestAllowed({ appMode: 'server' })).toBe(true);
  });
});
