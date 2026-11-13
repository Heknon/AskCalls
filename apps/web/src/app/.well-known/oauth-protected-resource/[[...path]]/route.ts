import { getContainer } from '../../../../server/container';
import { errorResponse } from '../../../../server/http/errors';
import { MCP_PATH, protectedResourceMetadata } from '../../../api/mcp/resource';

/**
 * RFC 9728 metadata for the remote MCP endpoint, at the root and at the path-suffixed URL
 * (`/.well-known/oauth-protected-resource/api/mcp`) that MCP clients try first.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  if (path && `/${path.join('/')}` !== MCP_PATH) {
    return errorResponse(404, 'not_found', 'no such protected resource');
  }
  let appUrl: string;
  try {
    appUrl = (await getContainer()).config.config.appUrl;
  } catch {
    return errorResponse(503, 'unavailable', 'instance unavailable');
  }
  return Response.json(protectedResourceMetadata(appUrl), {
    headers: { 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*' },
  });
}
