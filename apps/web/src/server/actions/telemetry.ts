'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { readSessionUserId } from '../auth/secret';
import { getContainer } from '../container';

const ClientEvent = z.discriminatedUnion('name', [
  z.object({
    name: z.literal('onboarding_step'),
    step: z.enum(['welcome', 'passkey', 'recovery', 'try', 'ai']),
  }),
  z.object({ name: z.literal('first_search_with_result') }),
]);
export type ClientEvent = z.infer<typeof ClientEvent>;

/**
 * Product events the browser reports (spec 11.3a). Typed and content-free; sent only when the
 * account opted in to product analytics, and dropped silently otherwise.
 */
export async function reportProductEvent(input: ClientEvent): Promise<void> {
  const parsed = ClientEvent.safeParse(input);
  if (!parsed.success) return;
  const { config, ports } = await getContainer();
  const userId = await readSessionUserId(await headers(), config);
  if (!userId) return;
  const user = await ports.users.findById(userId);
  if (!user?.telemetryConsent.productEvents) return;
  const limit = await ports.rateLimiter.hit(`rl:events:${userId}`, 30, 60_000);
  if (!limit.allowed) return;
  ports.telemetry.event(userId, parsed.data);
}
