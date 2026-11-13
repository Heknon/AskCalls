import { DEFAULT_LOCALE, type Locale } from './locales';
import type admin from './messages/en/admin.json';
import type auth from './messages/en/auth.json';
import type call from './messages/en/call.json';
import type calls from './messages/en/calls.json';
import type cli from './messages/en/cli.json';
import type common from './messages/en/common.json';
import type contacts from './messages/en/contacts.json';
import type dataFlow from './messages/en/dataFlow.json';
import type marketing from './messages/en/marketing.json';
import type onboarding from './messages/en/onboarding.json';
import type settings from './messages/en/settings.json';
import type shell from './messages/en/shell.json';
import type tags from './messages/en/tags.json';
import type unlock from './messages/en/unlock.json';
import type upload from './messages/en/upload.json';

/**
 * One message file per area and locale: `messages/<locale>/<namespace>.json`. A screen adds its
 * keys to its own namespace file, in every locale. English is the source of the types and the
 * fallback for a key a locale doesn't have yet.
 */
export type Messages = {
  admin: typeof admin;
  auth: typeof auth;
  call: typeof call;
  calls: typeof calls;
  cli: typeof cli;
  common: typeof common;
  contacts: typeof contacts;
  dataFlow: typeof dataFlow;
  marketing: typeof marketing;
  onboarding: typeof onboarding;
  settings: typeof settings;
  shell: typeof shell;
  tags: typeof tags;
  unlock: typeof unlock;
  upload: typeof upload;
};
export type Namespace = keyof Messages;

export const NAMESPACES = [
  'admin',
  'auth',
  'call',
  'calls',
  'cli',
  'common',
  'contacts',
  'dataFlow',
  'marketing',
  'onboarding',
  'settings',
  'shell',
  'tags',
  'unlock',
  'upload',
] as const satisfies readonly Namespace[];

type Tree = { [key: string]: string | Tree };

function withFallback(base: Tree, over: Tree | undefined): Tree {
  if (!over) return base;
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = base[k];
    out[k] = typeof v === 'object' && typeof b === 'object' ? withFallback(b, v) : v;
  }
  return out;
}

async function loadNamespace(locale: string, ns: Namespace): Promise<Tree | undefined> {
  try {
    return (await import(`./messages/${locale}/${ns}.json`)).default as Tree;
  } catch {
    return undefined;
  }
}

/** Every namespace for `locale`, with English filling any key it lacks. */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const base = (await loadNamespace(DEFAULT_LOCALE, ns)) ?? {};
      const own = locale === DEFAULT_LOCALE ? undefined : await loadNamespace(locale, ns);
      return [ns, withFallback(base, own)] as const;
    }),
  );
  return Object.fromEntries(entries) as unknown as Messages;
}
