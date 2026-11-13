/**
 * The agent setup snippets from README.md ("Use with your AI"), with this instance's URL in the
 * login command. `agent-snippets.test.ts` keeps them identical to the README.
 */
export const AGENT_CLIENTS = [
  'claudeCode',
  'claudeDesktop',
  'cursor',
  'vscode',
  'windsurf',
  'codex',
] as const;
export type AgentClient = (typeof AGENT_CLIENTS)[number];

export const CLIENT_NAMES: Record<AgentClient, string> = {
  claudeCode: 'Claude Code',
  claudeDesktop: 'Claude Desktop',
  cursor: 'Cursor',
  vscode: 'VS Code',
  windsurf: 'Windsurf',
  codex: 'Codex CLI',
};

export const README_URL = 'https://askcalls.com';

export const loginCommands = (url: string) =>
  [`bunx askcalls login --url ${url}`, 'bunx askcalls link'] as const;

const mcpServers = `{
  "mcpServers": {
    "askcalls": {
      "command": "bunx",
      "args": ["askcalls", "mcp"]
    }
  }
}`;

export const CLIENT_SNIPPETS: Record<AgentClient, { language: 'sh' | 'json'; code: string }> = {
  claudeCode: { language: 'sh', code: 'claude mcp add --scope user askcalls -- bunx askcalls mcp' },
  claudeDesktop: { language: 'json', code: mcpServers },
  cursor: { language: 'json', code: mcpServers },
  vscode: {
    language: 'json',
    code: `{
  "servers": {
    "askcalls": {
      "type": "stdio",
      "command": "bunx",
      "args": ["askcalls", "mcp"]
    }
  }
}`,
  },
  windsurf: { language: 'json', code: mcpServers },
  codex: { language: 'sh', code: 'codex mcp add askcalls -- bunx askcalls mcp' },
};
