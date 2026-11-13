import { DeviceLinkJoiner, KeySession } from '@askcalls/client-core';
import type { Command } from 'commander';
import { SecretStoreDeviceKeys } from '../adapters/device-keys';
import { type AgentDeps, isLinked, openAccount } from '../agent';
import { paths } from '../config';
import { type Io, terminalIo } from '../io';
import { fail } from './run';

/**
 * The link server rate-limits `fetch` to 120 per 10 minutes per address, and a session lives 10
 * minutes, so polling every 6 seconds can never run into the limit.
 */
export const LINK_POLL_MS = 6_000;

const formatFingerprint = (f: string) => `${f.slice(0, 3)} ${f.slice(3)}`;

/**
 * `askcalls link` (spec 6.5, joining device): reads the link code from Settings → Devices, shows
 * the 6-digit fingerprint of this computer's key, waits until the trusted device confirms, then
 * stores RK wrapped under a device secret in the keychain. The signing key is registered with the
 * server as part of the link.
 */
export async function runLink(
  opts: { code?: string; force?: boolean },
  deps: AgentDeps & { io: Io; pollMs?: number },
): Promise<{ deviceKeyId: string }> {
  const { io } = deps;
  const account = await openAccount(deps);
  if (!opts.force && (await isLinked(account.secrets))) {
    throw new Error('this computer is already linked; use --force to link it again');
  }
  io.out('In the AskCalls app, open Settings → Devices → Link a device.');
  const code =
    opts.code ?? (await io.readLine('Paste the link code shown there and press Enter: ')) ?? '';
  if (!code.trim()) throw new Error('no link code given');

  const deviceKeys = new SecretStoreDeviceKeys(account.secrets);
  const joiner = await DeviceLinkJoiner.join({
    api: account.api,
    code,
    deviceLabel: account.config.deviceLabel,
    deviceKeys,
  });
  io.out('');
  io.out(`  Fingerprint: ${formatFingerprint(joiner.fingerprint)}`);
  io.out('');
  io.out('Check that your other device shows the same 6 digits, then confirm there.');

  const session = new KeySession({ idleTimeoutMs: 0 });
  const pollMs = deps.pollMs ?? LINK_POLL_MS;
  for (;;) {
    const r = await joiner.poll({
      session,
      deviceKeys,
      storage: { kind: 'device-secret', secrets: account.secrets },
    });
    if (r.state === 'completed') {
      session.lock();
      io.out(`Linked as "${account.config.deviceLabel}".`);
      io.out(
        account.secretsKind === 'keychain'
          ? 'Your keys are stored in the OS keychain, wrapped under this device secret.'
          : `No OS keychain was found: your wrapped keys are in ${paths(account.dir).secrets}.`,
      );
      io.out('Add the MCP server to your AI client: bunx askcalls mcp');
      return { deviceKeyId: r.deviceKeyId };
    }
    if (r.state === 'expired') {
      throw new Error('the link session expired; start a new one in Settings → Devices');
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export function registerLink(program: Command) {
  program
    .command('link')
    .description('Link this computer to your account and store its keys in the OS keychain')
    .option('--code <code>', 'the link code from Settings → Devices (asked for when omitted)')
    .option('--force', 'replace an existing link on this computer')
    .action((opts: { code?: string; force?: boolean }) =>
      runLink(opts, { io: terminalIo() }).then(() => {}, fail),
    );
}
