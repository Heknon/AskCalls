import { getContainer, SetupRequiredError } from '@/server/container';

export const dynamic = 'force-dynamic';

/** Uptime check: database and storage reachability. Content-free. */
export async function GET() {
  try {
    const { ports } = await getContainer();
    const [database, storage] = await Promise.all([
      ports.users.healthCheck(),
      ports.blobs.healthCheck(),
    ]);
    const ok = database.ok && storage.ok;
    return Response.json(
      {
        ok,
        checks: {
          database: { ok: database.ok, message: database.message },
          storage: { ok: storage.ok, message: storage.message },
        },
      },
      { status: ok ? 200 : 503 },
    );
  } catch (e) {
    const message = e instanceof SetupRequiredError ? 'setup required' : 'unavailable';
    return Response.json(
      { ok: false, checks: { instance: { ok: false, message } } },
      { status: 503 },
    );
  }
}
