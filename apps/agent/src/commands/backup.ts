import { resolve } from 'node:path';
import type { Command } from 'commander';
import { dataDir } from '../config';
import { type Io, terminalIo } from '../io';
import { createBackup, restoreBackup } from '../local/backup';
import { fail } from './run';

const mib = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;

export async function runBackup(
  file: string,
  deps: { io: Io; env?: NodeJS.ProcessEnv },
): Promise<void> {
  const r = await createBackup(dataDir(deps.env), resolve(file));
  deps.io.out(`Backed up ${r.files} files (${mib(r.bytes)}) to ${r.file}.`);
  deps.io.out('It holds only encrypted data: restoring it needs your passkey, recovery code or');
  deps.io.out('passphrase to read anything.');
  if (r.secretsRemoved.length) {
    deps.io.out(`Not included (re-enter after a restore): ${r.secretsRemoved.join(', ')}.`);
  }
}

export async function runRestore(
  file: string,
  opts: { force?: boolean },
  deps: { io: Io; env?: NodeJS.ProcessEnv },
): Promise<void> {
  const dir = dataDir(deps.env);
  const r = await restoreBackup(dir, resolve(file), opts);
  deps.io.out(`Restored the backup from ${r.createdAt} into ${dir}.`);
  if (r.secretsRemoved.length) {
    deps.io.out(
      `Re-enter these settings at /admin/instance, they were not in the backup: ${r.secretsRemoved.join(', ')}.`,
    );
  }
  deps.io.out('Start it with: askcalls local');
}

export function registerBackup(program: Command) {
  program
    .command('backup')
    .description(
      'Export the encrypted local data directory to a tar file (stop askcalls local first)',
    )
    .argument('<file>')
    .action((file: string) => runBackup(file, { io: terminalIo() }).catch(fail));
  program
    .command('restore')
    .description('Import an encrypted backup into the local data directory')
    .argument('<file>')
    .option('--force', 'replace the local data that is there now')
    .action((file: string, opts: { force?: boolean }) =>
      runRestore(file, opts, { io: terminalIo() }).catch(fail),
    );
}
