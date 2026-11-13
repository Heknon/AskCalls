import type { Command } from 'commander';
import { notBuilt } from './not-built';

export function registerLogin(program: Command) {
  program
    .command('login')
    .description('Open a browser to create a personal access token (scopes: read write ask keys)')
    .requiredOption('--url <server>', 'AskCalls server URL', 'https://askcalls.com')
    .action(() => notBuilt('login', 'M9'));
}
