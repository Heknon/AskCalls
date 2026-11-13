/**
 * The e2e suite's Google: OAuth consent and token endpoints and Drive API v3, in memory. The
 * app server reaches its token endpoint through STORAGE_GOOGLE_TEST_OAUTH_URL (honoured only
 * with NODE_ENV=test); the browser reaches it through Playwright routes for accounts.google.com
 * and www.googleapis.com. GET /state reports what Drive holds, for assertions.
 */
import { createServer } from 'node:http';
import { FakeGoogle } from '@askcalls/client-core/testing/fake-google';

const port = Number(process.argv[2] ?? process.env.E2E_GOOGLE_PORT ?? 3419);
const google = new FakeGoogle();

async function answer(req: Request): Promise<Response> {
  const path = new URL(req.url).pathname;
  if (path === '/health') return new Response('ok');
  if (path === '/state') {
    return Response.json({
      files: [...google.files.values()].map((f) => ({
        id: f.id,
        name: f.name,
        bytes: f.bytes.length,
      })),
      revoked: google.revoked.size,
    });
  }
  return google.handle(req);
}

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
  const body =
    chunks.length && req.method !== 'GET' && req.method !== 'HEAD' ? Buffer.concat(chunks) : null;
  const out = await answer(
    new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers, body }),
  );
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(port, '127.0.0.1');
