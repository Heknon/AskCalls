import { DomainError } from '@askcalls/domain';
import { generateRegistrationOptions, verifyRegistrationResponse } from '@simplewebauthn/server';
import { createSetupAdmin, issueSetupClaim, normalizeEmail } from '../auth/local-accounts';
import type { ConfigService } from '../config/config-service';
import { applyConfig, finishSetup } from '../container';

/** What the wizard shows before anything is chosen: env-locked settings and the defaults. */
export function setupState(configService: ConfigService) {
  const resolved = configService.get();
  const { config, locked } = configService.redacted();
  const dataDir = configService.dataDir;
  return {
    config,
    locked,
    defaults: { pgliteDir: `${dataDir}/db`, fsDir: `${dataDir}/blobs` },
    environment: resolved.environment,
    appUrl: resolved.config.appUrl,
  };
}

interface PendingPasskey {
  challenge: string;
  email: string;
  expires: number;
}

// One wizard at a time: the newest options replace any earlier ones.
let pending: PendingPasskey | null = null;

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

export async function passkeyOptions(appUrl: string, rawEmail: string) {
  const email = normalizeEmail(rawEmail);
  const app = new URL(appUrl);
  const options = await generateRegistrationOptions({
    rpName: 'AskCalls',
    rpID: app.hostname,
    userID: crypto.randomUUID(),
    userName: email,
    timeout: 5 * 60_000,
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  pending = { challenge: options.challenge, email, expires: Date.now() + 5 * 60_000 };
  return options as unknown as Record<string, unknown>;
}

async function verifyPasskey(appUrl: string, email: string, response: unknown) {
  const p = pending;
  pending = null;
  if (!p || p.expires < Date.now() || p.email !== email) {
    throw new DomainError('invalid', 'create the passkey again');
  }
  const app = new URL(appUrl);
  const verification = await verifyRegistrationResponse({
    response: response as Parameters<typeof verifyRegistrationResponse>[0]['response'],
    expectedChallenge: p.challenge,
    expectedOrigin: app.origin,
    expectedRPID: app.hostname,
    requireUserVerification: false,
  }).catch(() => null);
  const info = verification?.verified ? verification.registrationInfo : undefined;
  if (!info) throw new DomainError('invalid', 'the passkey could not be verified');
  const transports = (response as { response?: { transports?: string[] } }).response?.transports;
  return {
    credentialId: b64(info.credentialID),
    publicKey: b64(info.credentialPublicKey),
    counter: info.counter,
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
    transports: transports?.length ? transports.join(',') : null,
  };
}

/**
 * Commits the wizard: validates and builds the new container, creates the admin there with a
 * password or a passkey, writes config.json, then consumes the setup token.
 */
export async function completeSetup(
  configService: ConfigService,
  patch: Record<string, unknown>,
  admin: { email: string; password?: string | undefined; passkey?: unknown },
): Promise<{ claim: string }> {
  if (!admin.password && !admin.passkey) {
    throw new DomainError('invalid', 'choose a password or a passkey');
  }
  const email = normalizeEmail(admin.email);
  const appUrl = configService.preview(patch, { allowIncomplete: true }).config.appUrl;
  const passkey = admin.passkey ? await verifyPasskey(appUrl, email, admin.passkey) : null;
  let claim = '';
  await applyConfig(patch, async (next) => {
    const user = await createSetupAdmin(next.ports, email, admin.password ?? null);
    if (passkey) {
      await next.ports.localCredentials.addPasskey({
        ...passkey,
        userId: user.id,
        providerAccountId: passkey.credentialId,
      });
      await next.ports.users.linkAccount({
        userId: user.id,
        provider: 'passkey',
        providerAccountId: passkey.credentialId,
        type: 'webauthn',
      });
    }
    claim = await issueSetupClaim(next.ports, user.id);
  });
  await finishSetup();
  return { claim };
}
