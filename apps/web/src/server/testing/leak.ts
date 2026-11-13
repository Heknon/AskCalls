import { uploadInbox } from '@askcalls/api-contract/routes/inbox';
import {
  createTag,
  getCall,
  ingestCall,
  Onboarding,
  processInbox,
  updateCallMeta,
  updateCallTags,
} from '@askcalls/client-core';
import { fakeAudio } from '@askcalls/client-core/testing/fakes';
import { normalizeText, tokenize, wordForms } from '@askcalls/indexing';
import { expect } from 'vitest';
import type { ClientHarness } from './client';
import { ENGLISH_CALL, HEBREW_CALL, INBOX_CALL, NOTES, TAG_NAME } from './samples';

/**
 * The leak test's seed and search (spec 2 rule 7), shared by its in-memory and PGlite + fs runs
 * (leak*.test.ts). Seeding goes through the full client pipeline into the real route handlers;
 * the search looks for every seeded word, name and number in UTF-8, UTF-16LE, UTF-16BE and every
 * normalized and token form indexing derives from them.
 */

const CONTACT = {
  name: 'Ignatius Pemberton-Vasquez',
  phone: '058-404-7712',
  e164: '+972584047712',
};

const SEEDED_TEXT = [
  ...ENGLISH_CALL.words,
  ...HEBREW_CALL.words,
  ...INBOX_CALL.words,
  ENGLISH_CALL.contactName,
  HEBREW_CALL.contactName,
  INBOX_CALL.contactName,
  CONTACT.name,
  TAG_NAME,
  NOTES,
  'Quote call about Orbitex',
];

const PHONES = [
  [ENGLISH_CALL.phone, ENGLISH_CALL.e164],
  [HEBREW_CALL.phone, HEBREW_CALL.e164],
  [INBOX_CALL.phone, INBOX_CALL.e164],
  [CONTACT.phone, CONTACT.e164],
] as const;

/** Distinctive enough that a random match in ciphertext or ids is implausible. */
function distinctive(s: string): boolean {
  const bytes = Buffer.byteLength(s, 'utf8');
  return /^\p{ASCII}*$/u.test(s) ? s.length >= 6 : bytes >= 6;
}

/** Every form a seeded string could take on the server if it leaked. */
export function needles(): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    if (distinctive(s)) out.add(s);
  };
  for (const text of SEEDED_TEXT) {
    add(text);
    add(text.toLowerCase());
    add(normalizeText(text));
    for (const token of tokenize(text)) {
      add(token);
      for (const f of wordForms(token)) add(f.form);
    }
  }
  for (const [display, e164] of PHONES) {
    const digits = e164.slice(1);
    add(display);
    add(e164);
    add(digits);
    add(`0${digits.slice(3)}`);
    add(display.replace(/\D/g, ''));
  }
  return [...out];
}

/** Bytes of every primitive reachable from `root`, map keys included. */
export function dump(root: unknown): Buffer {
  const parts: Buffer[] = [];
  const seen = new Set<object>();
  const visit = (v: unknown): void => {
    if (v === null || v === undefined) return;
    switch (typeof v) {
      case 'string':
        parts.push(Buffer.from(v, 'utf8'));
        return;
      case 'number':
      case 'bigint':
      case 'boolean':
        parts.push(Buffer.from(String(v)));
        return;
      case 'function':
      case 'symbol':
        return;
    }
    const o = v as object;
    if (seen.has(o)) return;
    seen.add(o);
    if (ArrayBuffer.isView(o)) {
      parts.push(Buffer.from(o.buffer, o.byteOffset, o.byteLength));
      return;
    }
    if (o instanceof ArrayBuffer) {
      parts.push(Buffer.from(o));
      return;
    }
    if (o instanceof Date) {
      parts.push(Buffer.from(o.toISOString()));
      return;
    }
    if (o instanceof Map) {
      for (const [k, val] of o) {
        visit(k);
        visit(val);
      }
      return;
    }
    if (o instanceof Set || Array.isArray(o)) {
      for (const val of o) visit(val);
      return;
    }
    for (const key of Object.getOwnPropertyNames(o)) {
      parts.push(Buffer.from(key));
      visit((o as Record<string, unknown>)[key]);
    }
  };
  visit(root);
  return Buffer.concat(parts.flatMap((p) => [p, Buffer.from([0])]));
}

const encodings = (s: string): Array<[string, Buffer]> => {
  const le = Buffer.from(s, 'utf16le');
  const be = Buffer.from(le);
  be.swap16();
  return [
    ['utf8', Buffer.from(s, 'utf8')],
    ['utf16le', le],
    ['utf16be', be],
  ];
};

export function findLeaks(haystack: Buffer, list: readonly string[]): string[] {
  return list.flatMap((n) =>
    encodings(n)
      .filter(([, b]) => haystack.includes(b))
      .map(([enc]) => `${enc}:${n}`),
  );
}

/**
 * Onboards the harness's user and stores, through the client pipeline: contacts, synonyms,
 * custom intents, a tag, three transcripts, an audio call with a recording backup, an inbox
 * upload processed on unlock, notes, a title, a tag and a star.
 */
export async function seedLeakData(h: ClientHarness): Promise<void> {
  const device = h.browser();
  const { ctx, session } = device;
  const o = await Onboarding.begin(h.userId);
  await o.addPassphrase('a long enough passphrase for tests');
  const [g1, g2] = o.confirmationGroups;
  o.confirmRecovery({ [g1]: o.recoveryGroups[g1]!, [g2]: o.recoveryGroups[g2]! });
  await o.finish({ api: ctx.api, session, deviceKeys: device.deviceKeys, deviceLabel: 'Device' });

  await ctx.userData.update('contacts', (d) => ({
    ...d,
    contacts: [{ id: 'c1', name: CONTACT.name, phones: [CONTACT.phone] }],
  }));
  await ctx.userData.update('synonyms', (d) => ({
    ...d,
    entries: [{ canonical: 'photovoltaic', variants: ['Xylophonix'] }],
  }));
  await ctx.userData.update('settings', (d) => ({
    ...d,
    customIntents: [
      { id: 'orbitex', label: 'Orbitex deals', examples: ['Orbitex warehouse panels'] },
    ],
  }));
  const tag = await createTag(ctx.userData, { name: TAG_NAME });

  const en = await ingestCall(ctx, {
    source: 'app',
    transcript: ENGLISH_CALL.text,
    transcriptFileName: ENGLISH_CALL.fileName,
    sourceFileName: 'Orbitex-Marcus.txt',
    meta: {
      phone: ENGLISH_CALL.phone,
      contactName: ENGLISH_CALL.contactName,
      startedAt: ENGLISH_CALL.startedAt,
      tags: [TAG_NAME, 'Bartholomew list'],
    },
  });
  const he = await ingestCall(ctx, {
    source: 'app',
    transcript: HEBREW_CALL.text,
    transcriptFileName: HEBREW_CALL.fileName,
    meta: { phone: HEBREW_CALL.phone, contactName: HEBREW_CALL.contactName },
  });
  const withContact = await ingestCall(ctx, {
    source: 'app',
    transcript: `Ignatius Pemberton-Vasquez called from ${CONTACT.phone} about Orbitex.`,
    meta: { phone: CONTACT.phone },
  });
  const audio = await ingestCall(ctx, {
    source: 'app',
    audio: {
      bytes: fakeAudio(new TextEncoder().encode('Orbitex Marcus '.repeat(8_000))),
      mimeType: 'audio/wav',
    },
    backupRecording: true,
    meta: { phone: INBOX_CALL.phone },
  });
  for (const r of [en, he, withContact, audio]) expect(r.status).toBe('done');

  await ctx.api.request(uploadInbox, {
    body: {
      transcriptText: INBOX_CALL.text,
      phone: INBOX_CALL.phone,
      contactName: INBOX_CALL.contactName,
      audioBase64: Buffer.from('Xylophonix audio Bartholomew').toString('base64'),
      audioMimeType: 'audio/ogg',
    },
  });
  expect(await processInbox(ctx)).toMatchObject({ processed: 1 });

  const call = await getCall(ctx, (en as { callId: string }).callId);
  await updateCallMeta(ctx, call, { notes: NOTES, title: 'Quote call about Orbitex' });
  await updateCallTags(ctx, call, { add: [tag.id, '__star'] });
}
