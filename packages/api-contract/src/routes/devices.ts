import { z } from 'zod';
import { defineRoute } from '../route';
import { BytesCodec, BytesMax, DateCodec } from '../wire';

/** Spec 6.5 device-link handshake. */
const LinkState = z.enum([
  'waiting_for_device',
  'waiting_for_confirmation',
  'completed',
  'expired',
]);
const SessionParam = z.object({ session: z.string().min(1).max(64) });
const Secret = z.string().min(16).max(128);

/** Step 1 (trusted device): returns the session id and one-time secret for the code / QR. */
export const startLink = defineRoute({
  method: 'POST',
  path: '/api/devices/link',
  auth: 'session',
  response: z.object({ sessionId: z.string(), secret: z.string(), expiresAt: DateCodec }),
});

/** Step 3 (trusted device): the joiner's public key, to show its fingerprint. */
export const getLink = defineRoute({
  method: 'GET',
  path: '/api/devices/link/:session',
  auth: 'session',
  params: SessionParam,
  response: z.object({
    state: LinkState,
    devicePublicKey: BytesCodec.nullable(),
    deviceLabel: z.string().nullable(),
    expiresAt: DateCodec,
  }),
});

/** Step 2 (new device): posts its ECDH and signing public keys, proving the link secret. */
export const joinLink = defineRoute({
  method: 'POST',
  path: '/api/devices/link/:session',
  auth: 'link',
  params: SessionParam,
  body: z.object({
    action: z.literal('join'),
    secret: Secret,
    devicePublicKey: BytesMax(512),
    deviceLabel: z.string().min(1).max(100),
    signingPublicKey: BytesMax(512),
  }),
  response: z.object({ state: LinkState, expiresAt: DateCodec }),
});

/** Step 4 (trusted device): posts ECIES(devicePublicKey, RK) after the fingerprint matched. */
export const confirmLink = defineRoute({
  method: 'POST',
  path: '/api/devices/link/:session',
  auth: 'session',
  params: SessionParam,
  body: z.object({ action: z.literal('confirm'), encryptedRootKey: BytesMax(1024) }),
  response: z.object({ deviceKeyId: z.string(), keyringEntryId: z.string() }),
});

/** Step 5 (new device): collects the encrypted RK once. */
export const fetchLink = defineRoute({
  method: 'POST',
  path: '/api/devices/link/:session',
  auth: 'link',
  params: SessionParam,
  body: z.object({ action: z.literal('fetch'), secret: Secret }),
  response: z.discriminatedUnion('state', [
    z.object({ state: z.literal('waiting_for_device') }),
    z.object({ state: z.literal('waiting_for_confirmation') }),
    z.object({ state: z.literal('expired') }),
    z.object({
      state: z.literal('completed'),
      encryptedRootKey: BytesCodec,
      deviceKeyId: z.string(),
      keyringEntryId: z.string().nullable(),
    }),
  ]),
});
