import type { ApiScope } from '@askcalls/domain';

/** The remote MCP endpoint; protected-resource metadata URLs derive from it (RFC 9728). */
export const MCP_PATH = '/api/mcp';

/** Tokens need at least one of these; each tool is offered only with its own scope. */
export const MCP_SCOPES: readonly ApiScope[] = ['read', 'write'];

export const PROTECTED_RESOURCE_PATH = '/.well-known/oauth-protected-resource';

export const resourceMetadataUrl = (appUrl: string) =>
  new URL(`${PROTECTED_RESOURCE_PATH}${MCP_PATH}`, appUrl).toString();

/**
 * Protected-resource metadata: tells MCP clients the endpoint takes bearer tokens in the
 * Authorization header. Tokens are created in Settings → API and MCP; there is no authorization
 * server yet (OAuth is R2), so none is listed.
 */
export function protectedResourceMetadata(appUrl: string) {
  return {
    resource: new URL(MCP_PATH, appUrl).toString(),
    resource_name: 'AskCalls remote MCP',
    bearer_methods_supported: ['header'],
    scopes_supported: [...MCP_SCOPES],
  };
}
