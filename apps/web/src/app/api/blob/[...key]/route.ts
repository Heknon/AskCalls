import { getContainer } from '@/server/container';
import { handleBlob } from '@/server/http/blob-route';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ key: string[] }> };

async function serve(req: Request, ctx: Ctx): Promise<Response> {
  const { ports } = await getContainer();
  const { key } = await ctx.params;
  return handleBlob(ports, req, key);
}

export const GET = serve;
export const HEAD = serve;
export const PUT = serve;
