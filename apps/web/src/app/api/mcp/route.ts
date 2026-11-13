import { isDomainError, type Ports } from '@askcalls/domain';
import { authenticateApiToken } from '@askcalls/domain/use-cases/tokens';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { type Container, getContainer, SetupRequiredError } from '../../../server/container';
import { errorResponse, NO_STORE } from '../../../server/http/errors';
import { RATE_LIMITS } from '../../../server/http/handler';
import { MCP_PATH, MCP_SCOPES, resourceMetadataUrl } from './resource';
import { createRemoteMcpServer } from './tools';

/** A JSON-RPC body: an inbox upload carries at most 3 MB of audio as base64. */
const MAX_BODY_BYTES = 4 * 1024 * 1024 + 64 * 1024;

function challenge(
  container: Container,
  status: 401 | 403,
  code: string,
  message: string,
  error?: 'invalid_token' | 'insufficient_scope',
): Response {
  const params = [
    ...(error ? [`error="${error}"`] : []),
    ...(error === 'insufficient_scope' ? [`scope="${MCP_SCOPES.join(' ')}"`] : []),
    `resource_metadata="${resourceMetadataUrl(container.config.config.appUrl)}"`,
  ];
  return errorResponse(
    status,
    code,
    message,
    {},
    { 'WWW-Authenticate': `Bearer ${params.join(', ')}` },
  );
}

async function rateLimited(ports: Ports, key: string, limit: number, windowMs: number) {
  const r = await ports.rateLimiter.hit(key, limit, windowMs);
  if (r.allowed) return null;
  const sec = Math.max(1, Math.ceil((r.resetAt.getTime() - ports.clock.now().getTime()) / 1000));
  return errorResponse(
    429,
    'rate_limited',
    'too many requests',
    {},
    { 'Retry-After': String(sec) },
  );
}

async function readJson(req: Request): Promise<unknown | Response> {
  const declared = req.headers.get('content-length');
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    return errorResponse(413, 'payload_too_large', 'request body is too large');
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = req.body?.getReader();
  for (;;) {
    const next = await reader?.read();
    if (!next || next.done) break;
    total += next.value.length;
    if (total > MAX_BODY_BYTES) {
      await reader?.cancel();
      for (const c of chunks) c.fill(0);
      return errorResponse(413, 'payload_too_large', 'request body is too large');
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    bytes.set(c, o);
    o += c.length;
    c.fill(0);
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return errorResponse(400, 'invalid', 'body is not valid JSON');
  } finally {
    bytes.fill(0);
  }
}

/**
 * Remote MCP (spec 10.2), stateless Streamable HTTP at exactly `/api/mcp`. Only personal access
 * tokens (`Authorization: Bearer ac_…`) are accepted, never session cookies. A missing or invalid
 * token gets 401 with `WWW-Authenticate` pointing at the protected-resource metadata, a token
 * with neither `read` nor `write` gets 403. Requests are rate-limited per user and per token,
 * responses are `no-store`, and request bodies are never logged.
 */
async function handle(req: Request): Promise<Response> {
  let container: Container;
  try {
    container = await getContainer();
  } catch (e) {
    const setup = e instanceof SetupRequiredError;
    return errorResponse(503, setup ? 'setup_required' : 'unavailable', 'instance unavailable');
  }
  const { ports } = container;
  try {
    const bearer = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!bearer) {
      return challenge(container, 401, 'unauthorized', 'a personal access token is required');
    }
    let auth: Awaited<ReturnType<typeof authenticateApiToken>>;
    try {
      auth = await authenticateApiToken(ports, bearer);
    } catch (e) {
      if (isDomainError(e) && e.code === 'unauthorized') {
        return challenge(container, 401, 'unauthorized', e.message, 'invalid_token');
      }
      throw e;
    }
    const { token, user } = auth;
    if (!MCP_SCOPES.some((s) => token.scopes.includes(s))) {
      return challenge(
        container,
        403,
        'forbidden',
        'token lacks the read or write scope',
        'insufficient_scope',
      );
    }
    const limited =
      (await rateLimited(
        ports,
        `rl:user:${user.id}`,
        RATE_LIMITS.perUser.limit,
        RATE_LIMITS.perUser.windowMs,
      )) ??
      (await rateLimited(
        ports,
        `rl:token:${token.id}`,
        RATE_LIMITS.perToken.limit,
        RATE_LIMITS.perToken.windowMs,
      ));
    if (limited) return limited;
    if (req.method !== 'POST') {
      return errorResponse(
        405,
        'method_not_allowed',
        'this endpoint is stateless: POST only',
        {},
        { Allow: 'POST' },
      );
    }
    const body = await readJson(req);
    if (body instanceof Response) return body;

    const server = createRemoteMcpServer({
      ports,
      actor: { kind: 'token', userId: user.id, tokenId: token.id, scopes: token.scopes },
    });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    await server.connect(transport);
    try {
      const res = await transport.handleRequest(req, { parsedBody: body });
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(NO_STORE)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    } finally {
      await server.close();
    }
  } catch {
    ports.telemetry.error({ code: 'internal', route: MCP_PATH, errorName: 'mcp' });
    return errorResponse(500, 'internal', 'internal error');
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
