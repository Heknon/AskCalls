import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Crockford base32 without the look-alikes I, L, O, U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomToken(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(20));
  const chars = [...bytes].map((b) => ALPHABET[b & 31]).join('');
  return chars.match(/.{5}/g)!.join('-');
}

const normalize = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, '');

function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * The first-admin claim (design open question 1). A fresh instance has no admin, and the
 * first account becomes one, so on a public URL a stranger could claim it. At boot a fresh
 * instance generates a one-time token (100 bits), prints it to stdout and writes it to
 * `<data dir>/setup-token` (owner-only). Every setup request must carry it, from any address:
 * behind a reverse proxy a loopback check can't be trusted. It is consumed when the admin
 * account is created and is never stored anywhere else.
 */
export class SetupToken {
  private value: string | null = null;

  constructor(private readonly dir: string) {}

  get path(): string {
    return join(this.dir, 'setup-token');
  }

  async issue(appUrl: string): Promise<string> {
    const token = randomToken();
    this.value = normalize(token);
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await writeFile(this.path, `${token}\n`, { mode: 0o600 });
    process.stdout.write(
      [
        '',
        'AskCalls needs setup. Open the setup page and enter this setup token:',
        '',
        `    ${new URL('/setup', appUrl).href}`,
        `    ${token}`,
        '',
        `It is also saved in ${this.path} and stops working once the admin account exists.`,
        '',
        '',
      ].join('\n'),
    );
    return token;
  }

  /** For tests: a token without the file or the log line. */
  static forTests(token: string): SetupToken {
    const t = new SetupToken('');
    t.value = normalize(token);
    return t;
  }

  verify(given: string | null | undefined): boolean {
    if (!this.value || !given) return false;
    return constantTimeEqual(normalize(given), this.value);
  }

  async consume(): Promise<void> {
    this.value = null;
    if (this.dir) await rm(this.path, { force: true });
  }
}
