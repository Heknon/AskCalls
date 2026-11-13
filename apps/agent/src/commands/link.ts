import type { Command } from 'commander';
import { notBuilt } from './not-built';

export function registerLink(program: Command) {
  program
    .command('link')
    .description('Link this computer to your account and store its keys in the OS keychain')
    .action(() => notBuilt('link', 'M9'));
}
