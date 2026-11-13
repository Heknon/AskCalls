import { processInbox } from '@askcalls/client-core';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Command } from 'commander';
import {
  type AgentDeps,
  NotLinkedError,
  NotLoggedInError,
  openAccount,
  unlockAgent,
} from '../agent';
import { DEFAULT_DECRYPT_BUDGET, dataDir, loadConfig, paths } from '../config';
import { type AgentState, createAgentMcpServer } from '../mcp/server';
import { VERSION } from '../version';
import { describeError } from './run';

/**
 * Unlocks from the keychain. When that is impossible (not logged in, not linked, keychain
 * missing), the server still starts and every tool answers with the reason, so the user sees it
 * in their AI client rather than a server that silently failed to start.
 */
export async function startAgentState(
  deps: AgentDeps,
  log: (line: string) => void,
): Promise<{
  state: AgentState;
  decryptBudget: number;
  configPath: string;
  /** The server could not be reached: worth trying again on the next tool call. */
  unreachable: boolean;
}> {
  const dir = deps.dir ?? dataDir(deps.env);
  const configPath = paths(dir).config;
  let decryptBudget = DEFAULT_DECRYPT_BUDGET;
  try {
    decryptBudget = (await loadConfig(dir)).decryptBudget;
    const agent = await unlockAgent(await openAccount(deps), deps);
    processInbox(agent.ctx).then(
      (r) => {
        if (r.processed || r.duplicates || r.failed.length) {
          log(
            `askcalls: inbox processed ${r.processed}, duplicates ${r.duplicates}, failed ${r.failed.length}`,
          );
        }
      },
      (e) => log(`askcalls: inbox not processed: ${describeError(e)}`),
    );
    return { state: { ctx: agent.ctx }, decryptBudget, configPath, unreachable: false };
  } catch (e) {
    const reason =
      e instanceof NotLoggedInError || e instanceof NotLinkedError
        ? `AskCalls: ${e.message}`
        : `AskCalls could not unlock: ${describeError(e)}`;
    log(reason);
    return {
      state: { unavailable: reason },
      decryptBudget,
      configPath,
      unreachable: isUnreachable(e),
    };
  }
}

/** A failed fetch (connection refused): the server, typically `askcalls local`, is not running. */
const isUnreachable = (e: unknown) => e instanceof TypeError;

const LOCAL_DOWN =
  'AskCalls: the AskCalls server is not reachable. If it runs on this computer, start it with askcalls local.';

export function registerMcp(program: Command) {
  program
    .command('mcp')
    .description('Run the stdio MCP server for Claude, Cursor and other MCP clients')
    .action(async () => {
      const log = (line: string) => console.error(line);
      const first = await startAgentState({}, log);
      const { decryptBudget, configPath } = first;
      const retry = async (): Promise<AgentState> => {
        const next = await startAgentState({}, log);
        return 'unavailable' in next.state && next.unreachable
          ? { unavailable: LOCAL_DOWN }
          : next.state;
      };
      const state = first.unreachable ? { unavailable: LOCAL_DOWN } : first.state;
      const server = createAgentMcpServer({
        state,
        ...(first.unreachable && { retry }),
        decryptBudget,
        configPath,
        version: VERSION,
      });
      await server.connect(new StdioServerTransport());
    });
}
