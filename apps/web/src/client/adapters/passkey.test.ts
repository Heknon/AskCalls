import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebAuthnPasskeyAuthenticator } from './passkey';

const PRF = new Uint8Array(32).fill(7);

function credential(extensions: Record<string, unknown>, transports: string[] = []) {
  return {
    type: 'public-key',
    rawId: Uint8Array.of(1, 2, 3).buffer,
    response: { getTransports: () => transports },
    getClientExtensionResults: () => extensions,
  };
}

function container(onCreate: unknown, onGet?: unknown) {
  const calls = { create: [] as unknown[], get: [] as CredentialRequestOptions[] };
  const c = {
    create: async (o: unknown) => {
      calls.create.push(o);
      return onCreate;
    },
    get: async (o: CredentialRequestOptions) => {
      calls.get.push(o);
      return onGet;
    },
  } as unknown as CredentialsContainer;
  return { c, calls };
}

function browserWithPrf(prf: boolean) {
  vi.stubGlobal('navigator', { credentials: {} });
  vi.stubGlobal('PublicKeyCredential', {
    getClientCapabilities: async () => ({ 'extension:prf': prf }),
  });
}

const create = (c: CredentialsContainer) =>
  new WebAuthnPasskeyAuthenticator({ rpId: 'askcalls.test', credentials: c }).create({
    userName: 'u',
    prfSalt: new Uint8Array(32),
  });

beforeEach(() => browserWithPrf(true));
afterEach(() => vi.unstubAllGlobals());

describe('WebAuthnPasskeyAuthenticator.create', () => {
  it('returns the PRF output and the transports', async () => {
    const { c } = container(
      credential({ prf: { enabled: true, results: { first: PRF } } }, ['internal', 'hybrid']),
    );
    const r = await create(c);
    expect(r.prfOutput).toEqual(PRF);
    expect(r.transports).toEqual(['internal', 'hybrid']);
  });

  it('blames a password manager when a PRF-capable browser returns no prf result', async () => {
    const { c } = container(credential({ credProps: undefined }));
    expect(await create(c)).toMatchObject({ prfOutput: null, noPrf: 'passwordManager' });
  });

  it('reports unsupported when the browser lacks PRF', async () => {
    browserWithPrf(false);
    const { c } = container(credential({}));
    expect(await create(c)).toMatchObject({ prfOutput: null, noPrf: 'unsupported' });
  });

  it('reports unsupported when the authenticator says PRF is off', async () => {
    const { c } = container(credential({ prf: { enabled: false } }));
    expect(await create(c)).toMatchObject({ prfOutput: null, noPrf: 'unsupported' });
  });

  it('evaluates PRF on assertion, and reports unsupported when that returns none', async () => {
    const { c, calls } = container(
      credential({ prf: { enabled: true } }, ['usb']),
      credential({ prf: {} }),
    );
    expect(await create(c)).toMatchObject({ prfOutput: null, noPrf: 'unsupported' });
    expect(calls.get[0]?.publicKey?.allowCredentials?.[0]?.transports).toEqual(['usb']);
  });
});

describe('WebAuthnPasskeyAuthenticator.assert', () => {
  it('sends stored transports and omits them when unknown', async () => {
    const { c, calls } = container(
      null,
      credential({ prf: { results: { first: PRF.buffer.slice(0) } } }),
    );
    const auth = new WebAuthnPasskeyAuthenticator({ rpId: 'askcalls.test', credentials: c });
    const r = await auth.assert({
      credentials: [{ id: 'AQID', transports: ['usb', 'nfc'] }, { id: 'BAUG' }],
      prfSalt: new Uint8Array(32),
    });
    expect(r.prfOutput).toEqual(PRF);
    const allowed = calls.get[0]?.publicKey?.allowCredentials ?? [];
    expect(allowed.map((a) => a.transports)).toEqual([['usb', 'nfc'], undefined]);
  });
});
