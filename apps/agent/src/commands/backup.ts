import type { Command } from 'commander';
import { notBuilt } from './not-built';

export function registerBackup(program: Command) {
  program
    .command('backup')
    .description('Export the encrypted local data directory')
    .argument('<file>')
    .action(() => notBuilt('backup', 'M9c'));
  program
    .command('restore')
    .description('Import an encrypted backup into the local data directory')
    .argument('<file>')
    .action(() => notBuilt('restore', 'M9c'));
}
