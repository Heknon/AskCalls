/**
 * The remote MCP snippets from README.md ("Remote MCP"), with this instance's URL.
 * `remote-snippets.test.ts` keeps them identical to the README.
 */
export const mcpUrl = (origin: string) => `${origin}/api/mcp`;

export const remoteCli = (origin: string) =>
  `claude mcp add --transport http askcalls-remote ${mcpUrl(origin)} \\
  --header "Authorization: Bearer ac_..."`;

export const remoteJson = (origin: string) => `{
  "mcpServers": {
    "askcalls-remote": {
      "url": "${mcpUrl(origin)}",
      "headers": { "Authorization": "Bearer ac_..." }
    }
  }
}`;

/** Tools the remote server offers (spec 10.2), in README order. */
export const REMOTE_TOOLS = ['inbox_upload', 'list_recent_calls', 'account_status'] as const;
