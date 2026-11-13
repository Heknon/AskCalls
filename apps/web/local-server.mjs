/**
 * The server `askcalls local` starts (spec 11.2c): the Next.js standalone build behind a loopback
 * guard. It listens on 127.0.0.1 only, drops every connection whose socket's remote address is
 * not loopback, and answers 421 to a Host header that does not name this server (DNS
 * rebinding). Requests that pass run inside an AsyncLocalStorage context that middleware checks
 * (server/http/local-guard.ts), so local mode fails closed when started any other way.
 *
 * Environment: PORT (required), and the instance settings `askcalls local` sets.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import module from 'node:module';
import { isIP } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GUARD = Symbol.for('askcalls.local.guard');

/** 127.0.0.0/8, ::1 and their IPv4-mapped IPv6 forms. */
export function isLoopbackAddress(address) {
  if (typeof address !== 'string') return false;
  const v4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(v4) === 4) return v4.split('.')[0] === '127';
  return address === '::1' || address === '0:0:0:0:0:0:0:1';
}

/** `localhost:<port>`, `127.0.0.1:<port>` and `[::1]:<port>`, case-insensitive. */
export function isAllowedHost(host, port) {
  if (typeof host !== 'string') return false;
  const h = host.toLowerCase();
  return [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(h);
}

/** The request listener: guard, then Next.js inside the guard's context. */
export function guarded(handle, port, storage) {
  return (req, res) => {
    if (!isLoopbackAddress(req.socket.remoteAddress)) {
      req.socket.destroy();
      return;
    }
    if (!isAllowedHost(req.headers.host, port)) {
      res.writeHead(421, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
      res.end('This AskCalls answers only on localhost.\n');
      return;
    }
    storage.run({ loopback: true }, () => handle(req, res));
  };
}

async function main() {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error('askcalls local: PORT must be a port number');
    process.exit(2);
  }
  const dir = dirname(fileURLToPath(import.meta.url));
  process.chdir(dir);
  const { config } = JSON.parse(
    readFileSync(join(dir, '.next', 'required-server-files.json'), 'utf8'),
  );
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);
  const storage = new AsyncLocalStorage();
  globalThis[GUARD] = storage;

  const next = module.createRequire(import.meta.url)('next');
  const app = next({ dir, dev: false, hostname: '127.0.0.1', port, conf: config });
  await app.prepare();
  const server = createServer(guarded(app.getRequestHandler(), port, storage));
  server.on('connection', (socket) => {
    if (!isLoopbackAddress(socket.remoteAddress)) socket.destroy();
  });

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    server.close();
    server.closeAllConnections();
    // The composition root's container (server/container.ts): closing it checkpoints PGlite.
    const container = await globalThis.__askcalls?.container.catch(() => null);
    await container?.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  // `askcalls local` owns this server: if it dies without stopping it, stop too, so nothing
  // keeps the database open behind a later `askcalls backup` or `restore`.
  const parent = Number(process.env.ASKCALLS_PARENT_PID);
  if (Number.isInteger(parent) && parent > 1) {
    setInterval(() => {
      try {
        process.kill(parent, 0);
      } catch {
        stop();
      }
    }, 2_000).unref();
  }

  server.listen(port, '127.0.0.1', () => {
    console.error(`askcalls local: listening on http://localhost:${port}`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
