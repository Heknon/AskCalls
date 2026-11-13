import type { Contact } from '@askcalls/client-core/userdata';
import { type CountryCode, parsePhone } from '@askcalls/indexing';

export interface VCard {
  name: string;
  phones: string[];
}

const unescapeValue = (v: string) =>
  v.replace(/\\([,;\\nN])/g, (_, c) => (c === 'n' || c === 'N' ? ' ' : c));

function quotedPrintable(v: string): string {
  const bytes: number[] = [];
  const soft = v.replace(/=\r?\n/g, '');
  for (let i = 0; i < soft.length; i++) {
    const hex = soft.slice(i + 1, i + 3);
    if (soft[i] === '=' && /^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      i += 2;
    } else bytes.push(...new TextEncoder().encode(soft[i]));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Content lines with folded continuations joined (RFC 6350 3.2), and QP soft breaks. */
function contentLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && out.length) {
      out[out.length - 1] += raw.slice(1);
    } else if (out.length && /QUOTED-PRINTABLE/i.test(out.at(-1)!) && out.at(-1)!.endsWith('=')) {
      out[out.length - 1] = `${out.at(-1)!.slice(0, -1)}${raw}`;
    } else out.push(raw);
  }
  return out;
}

/** Names and numbers from a vCard 2.1, 3.0 or 4.0 file; everything else is ignored. */
export function parseVcf(text: string): VCard[] {
  const cards: VCard[] = [];
  let cur: { fn: string | null; n: string | null; phones: string[] } | null = null;
  for (const line of contentLines(text.replace(/^﻿/, ''))) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const [prop = '', ...params] = head.split(';');
    const name = prop.replace(/^item\d+\./i, '').toUpperCase();
    let value = line.slice(colon + 1);
    if (params.some((p) => /QUOTED-PRINTABLE/i.test(p))) value = quotedPrintable(value);
    if (name === 'BEGIN' && value.trim().toUpperCase() === 'VCARD') {
      cur = { fn: null, n: null, phones: [] };
    } else if (name === 'END' && cur) {
      const fullName = (cur.fn ?? cur.n ?? '').trim();
      if (fullName) cards.push({ name: fullName, phones: cur.phones });
      cur = null;
    } else if (cur && name === 'FN') {
      cur.fn = unescapeValue(value).trim();
    } else if (cur && name === 'N') {
      const [family = '', given = '', middle = ''] = value.split(';').map(unescapeValue);
      cur.n = [given, middle, family]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' ');
    } else if (cur && name === 'TEL') {
      const tel = value.replace(/^tel:/i, '').trim();
      if (tel) cur.phones.push(tel);
    }
  }
  return cards;
}

/**
 * Adds imported cards to the contact list: numbers become E.164, cards without a usable number
 * are skipped, and a card sharing a number with a saved contact counts as already there.
 */
export function mergeVcards(
  existing: readonly Contact[],
  cards: readonly VCard[],
  region: CountryCode,
  newId: () => string,
): { contacts: Contact[]; imported: number; existed: number } {
  const known = new Set(existing.flatMap((c) => c.phones.map((p) => parsePhone(p, region) ?? p)));
  const added: Contact[] = [];
  let existed = 0;
  for (const card of cards) {
    const phones = [
      ...new Set(card.phones.map((p) => parsePhone(p, region)).filter((p): p is string => !!p)),
    ];
    if (phones.length === 0) continue;
    if (phones.some((p) => known.has(p))) {
      existed++;
      continue;
    }
    for (const p of phones) known.add(p);
    added.push({ id: newId(), name: card.name.slice(0, 200), phones: phones.slice(0, 20) });
  }
  return { contacts: [...existing, ...added], imported: added.length, existed };
}

/** Name or digits, as typed in the filter. */
export function matchesFilter(c: Contact, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  if (c.name.toLocaleLowerCase().includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  if (digits.length < 3) return false;
  return c.phones.some((p) => {
    const d = p.replace(/\D/g, '');
    return d.includes(digits) || d.includes(digits.replace(/^0/, ''));
  });
}
