/**
 * Runs a command with the network disabled: in a new user and network namespace
 * (`unshare --user --map-root-user --net`), where only the loopback interface exists. Every
 * process the command starts (the server, the browser) can reach 127.0.0.1 and nothing else.
 *
 *   bun scripts/without-network.ts -- <command> [args…]
 *
 * Linux only. Needs util-linux `unshare` and unprivileged user namespaces (or root); brings the
 * loopback interface up with `ip`, or with an ioctl through python3 where `ip` is missing.
 * Before running the command it checks that an outside address is unreachable and loopback works.
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const command = args[0] === '--' ? args.slice(1) : args;
if (command.length === 0) {
  console.error('usage: bun scripts/without-network.ts -- <command> [args…]');
  process.exit(2);
}
if (process.platform !== 'linux') {
  console.error('without-network: needs Linux network namespaces');
  process.exit(2);
}

const LOOPBACK_UP = `
if command -v ip >/dev/null 2>&1; then ip link set lo up
else python3 -I -c '
import fcntl, socket, struct
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
flags = struct.unpack("16sH", fcntl.ioctl(s, 0x8913, struct.pack("16sH", b"lo", 0)))[1]
fcntl.ioctl(s, 0x8914, struct.pack("16sH", b"lo", flags | 1))
'
fi`;

const CHECK = `
node -e '
const net = require("node:net");
const probe = (host, port) => new Promise((resolve) => {
  const s = net.connect({ host, port, timeout: 2000 });
  s.on("connect", () => { s.destroy(); resolve(true); });
  s.on("error", () => resolve(false));
  s.on("timeout", () => { s.destroy(); resolve(false); });
});
const server = net.createServer().listen(0, "127.0.0.1", async () => {
  const loop = await probe("127.0.0.1", server.address().port);
  const outside = await probe("1.1.1.1", 443);
  server.close();
  if (!loop || outside) { console.error("without-network: isolation check failed"); process.exit(1); }
  console.error("without-network: loopback only");
});
'`;

const script = `set -e\n${LOOPBACK_UP}\n${CHECK}\nexec "$@"`;
const r = spawnSync(
  'unshare',
  ['--user', '--map-root-user', '--net', 'sh', '-c', script, 'without-network', ...command],
  {
    stdio: 'inherit',
    env: { ...process.env, HTTPS_PROXY: '', HTTP_PROXY: '', https_proxy: '', http_proxy: '' },
  },
);
if (r.error) {
  console.error(`without-network: ${r.error.message}`);
  process.exit(2);
}
process.exit(r.status ?? 1);
