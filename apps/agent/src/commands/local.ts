import type { Command } from 'commander';
import { notBuilt } from './not-built';

export function registerLocal(program: Command) {
  program
    .command('local')
    .description('Run AskCalls entirely on this computer, bound to 127.0.0.1')
    .option('--port <port>', 'port to listen on', '4317')
    .option('--no-open', 'do not open the browser')
    .action(() => notBuilt('local', 'M9c'));
}
