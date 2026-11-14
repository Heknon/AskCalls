import { token } from '@askcalls/crypto';
import { type CountryCode, parsePhone } from '@askcalls/indexing';
import { contactKeys, INVISIBLE, isNumberName, nameKey, normalizeName } from './contact-names';
import type { KeySession } from './session';
import { type Contact, randomId, type UserDataStore } from './userdata';

export { contactKeys, isNumberName, nameKey, normalizeName };

/**
 * What a call's `contactTok` hashes: its number in E.164, or, for a call with only a name (a
 * recording of a saved contact), the normalised name.
 */
export function callContactKey(phoneE164: string | null, name: string | null): string | null {
  if (phoneE164) return phoneE164;
  return name && normalizeName(name) ? nameKey(name) : null;
}

export const contactToken = (session: KeySession, key: string) =>
  token(session.keys.indexKey, 'c', key);

/** A new call's contact name (none when it is only the number) and its contact token. */
export function callContact(session: KeySession, phoneE164: string | null, name: string | null) {
  const shown = name && !isNumberName(name) ? name : null;
  const key = callContactKey(phoneE164, shown);
  return { name: shown, token: key ? contactToken(session, key) : Promise.resolve(null) };
}

const named = (c: Contact, name: string) =>
  [c.name, ...c.aliases].some((n) => normalizeName(n) === normalizeName(name));

/**
 * The contact list with the other party of one call in it. A known number changes nothing,
 * except that a contact named only by its number takes the call's name. A known name gains the
 * number. Anything else is a new contact, named by the number when the call has no name.
 */
export function withCallContact(
  contacts: readonly Contact[],
  call: { phoneE164: string | null; name: string | null },
  region: CountryCode,
  newId: () => string = randomId,
): Contact[] | null {
  const given = call.name?.replace(INVISIBLE, '').trim() || null;
  const name = given && !isNumberName(given) ? given : null;
  const phone = call.phoneE164;
  if (!phone && !name) return null;
  const byPhone = phone
    ? contacts.find((c) => c.phones.some((p) => parsePhone(p, region) === phone))
    : undefined;
  if (byPhone) {
    if (!name || !isNumberName(byPhone.name)) return null;
    return contacts.map((c) => (c === byPhone ? { ...c, name } : c));
  }
  const byName = name ? contacts.find((c) => named(c, name)) : undefined;
  if (byName) {
    if (!phone || byName.phones.length >= 20) return null;
    return contacts.map((c) => (c === byName ? { ...c, phones: [...c.phones, phone] } : c));
  }
  return [
    ...contacts,
    { id: newId(), name: name ?? phone!, phones: phone ? [phone] : [], aliases: [] },
  ];
}

/** Adds a call's other party to the contact list when it isn't there yet. */
export async function ensureCallContact(
  userData: UserDataStore,
  call: { phoneE164: string | null; name: string | null },
  region: CountryCode,
): Promise<void> {
  const current = await userData.get('contacts');
  if (!withCallContact(current.contacts, call, region)) return;
  await userData.update('contacts', (d) => {
    const next = withCallContact(d.contacts, call, region);
    return next ? { ...d, contacts: next } : d;
  });
}
