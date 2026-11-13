import type { KeySession } from '@askcalls/client-core/session';

/**
 * What the calls screens keep between routes while unlocked: the last search (its text never
 * goes in the URL), the ask consent and the deletes waiting on their Undo. Memory only, wiped
 * when the session locks.
 */
export interface LastSearch {
  text: string;
  /** Phone numbers chosen in the contact blank without a contact entry. */
  numbers: string[];
  /** Word forms searched, to mark the same words in the transcript. */
  forms: string[];
  excluded: string[];
  /** The calls in result order, for j / k in the call view. */
  ids: string[];
  /** The filter query string of the list (`?tag=…`). */
  query: string;
  /** Per call, the passage that matched: its language and chunk, to open the call there. */
  matched?: Record<string, { lang: string | null; translated: boolean; ord: number | null }>;
}

let lastSearch: LastSearch | null = null;
let consentKey: string | null = null;
const wiredSessions = new WeakSet<KeySession>();

function wire(session: KeySession) {
  if (wiredSessions.has(session)) return;
  wiredSessions.add(session);
  session.onWipe(() => {
    lastSearch = null;
    consentKey = null;
  });
}

export function rememberSearch(session: KeySession, search: LastSearch | null) {
  wire(session);
  lastSearch = search;
}

export const recalledSearch = (): LastSearch | null => lastSearch;

export function rememberConsent(session: KeySession, key: string | null) {
  wire(session);
  consentKey = key;
}

export const hasConsent = (key: string) => consentKey === key;
