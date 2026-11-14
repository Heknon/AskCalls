import { updateCall } from '@askcalls/api-contract/routes/calls';
import { DEFAULT_PHONE_REGION, isPhoneRegion } from '@askcalls/indexing';
import { listCalls } from './calls';
import { callContactKey, contactToken, withCallContact } from './contacts';
import type { ClientContext } from './context';

export interface ContactBackfillResult {
  /** Contacts added or changed. */
  contacts: number;
  /** Calls with only a name, now found by contact. */
  linked: number;
  failed: number;
}

/**
 * Brings calls stored before contacts were made at import into the contact list: every other
 * party gets a contact, and calls with only a name get the contact token they lacked. Decrypts
 * metadata only, on this device. Records in settings that it ran, once nothing failed.
 */
export async function backfillCallContacts(ctx: ClientContext): Promise<ContactBackfillResult> {
  const settings = await ctx.userData.get('settings');
  const region = isPhoneRegion(settings.phoneRegion) ? settings.phoneRegion : DEFAULT_PHONE_REGION;
  const parties: { phoneE164: string | null; name: string | null }[] = [];
  const nameOnly: { id: string; key: string }[] = [];
  let failed = 0;
  let cursor: string | null = null;
  do {
    const page = await listCalls(ctx, { limit: 100, cursor });
    for (const row of page.items) {
      const meta = await row.meta().catch(() => null);
      if (!meta) {
        failed++;
        continue;
      }
      parties.push({ phoneE164: meta.phoneE164, name: meta.contactName });
      const key = callContactKey(null, meta.contactName);
      if (!meta.phoneE164 && key) nameOnly.push({ id: row.id, key });
    }
    cursor = page.nextCursor;
  } while (cursor);

  let changed = 0;
  await ctx.userData.update('contacts', (d) => {
    let contacts = d.contacts;
    changed = 0;
    for (const p of parties) {
      const next = withCallContact(contacts, p, region);
      if (next) {
        contacts = next;
        changed++;
      }
    }
    return changed ? { ...d, contacts } : d;
  });

  let linked = 0;
  for (const call of nameOnly) {
    try {
      await ctx.api.request(updateCall, {
        params: { id: call.id },
        body: { contactTok: await contactToken(ctx.session, call.key) },
      });
      linked++;
    } catch {
      failed++;
    }
  }
  if (failed === 0) {
    await ctx.userData.update('settings', (s) => ({ ...s, contactsFromCalls: true }));
  }
  return { contacts: changed, linked, failed };
}
