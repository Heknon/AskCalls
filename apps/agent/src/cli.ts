#!/usr/bin/env bun
import { Command } from 'commander';
import { registerBackup } from './commands/backup';
import { registerIngest } from './commands/ingest';
import { registerLink } from './commands/link';
import { registerLocal } from './commands/local';
import { registerLogin } from './commands/login';
import { registerMcp } from './commands/mcp';
import { VERSION } from './version';

export function buildProgram(): Command {
  const program = new Command()
    .name('askcalls')
    .description(
      'Search, read and import your AskCalls calls from this computer. Keys stay on this device.',
    )
    .version(VERSION);
  registerLogin(program);
  registerLink(program);
  registerMcp(program);
  registerIngest(program);
  registerLocal(program);
  registerBackup(program);
  return program;
}

if (import.meta.main) {
  await buildProgram().parseAsync(process.argv);
}
