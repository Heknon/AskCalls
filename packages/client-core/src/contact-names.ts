import { type CountryCode, parsePhone } from '@askcalls/indexing';
import type { Contact } from './userdata';

export const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** A name as it is compared: no bidi marks, one Unicode form, one case, single spaces. */
export const normalizeName = (name: string) =>
  name.normalize('NFC').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** The contact key of a call with a name and no number. */
export const nameKey = (name: string) => `name:${normalizeName(name)}`;

/** A name that is only a number: what a contact made from a call with no name is called. */
export const isNumberName = (name: string) => /^\+?[\d\s().-]+$/.test(name.trim());

/** Every key a contact's calls can carry: its numbers, its name and the names it had before. */
export function contactKeys(contact: Contact, region: CountryCode): string[] {
  const phones = contact.phones.map((p) => parsePhone(p, region)).filter((p) => p !== null);
  const names = [contact.name, ...contact.aliases].filter((n) => normalizeName(n));
  return [...new Set([...phones, ...names.map(nameKey)])];
}
