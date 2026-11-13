import type { Command } from 'commander';
import { notBuilt } from './not-built';

export function registerIngest(program: Command) {
  program
    .command('ingest')
    .description('Import calls from a file or folder')
    .argument('<path>', 'audio or transcript file, folder, or ZIP')
    .option(
      '--manifest <file>',
      'manifest.csv with file, phone, started_at, direction, contact_name, tags',
    )
    .option('--backup-recordings', 'store encrypted recording backups')
    .option('--transcribe <mode>', 'auto | never', 'auto')
    .action(() => notBuilt('ingest', 'M9'));
}
