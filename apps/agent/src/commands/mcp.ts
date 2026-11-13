import type { Command } from 'commander';
import { notBuilt } from './not-built';

export function registerMcp(program: Command) {
  program
    .command('mcp')
    .description('Run the stdio MCP server for Claude, Cursor and other MCP clients')
    .action(() => notBuilt('mcp', 'M9'));
}
