import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES } from './locales';
import { loadMessages, NAMESPACES } from './messages';

const dir = join(import.meta.dirname, 'messages');
type Tree = { [k: string]: string | Tree };
const read = (locale: string, ns: string): Tree =>
  JSON.parse(readFileSync(join(dir, locale, `${ns}.json`), 'utf8'));

function keys(t: Tree, prefix = ''): string[] {
  return Object.entries(t).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  );
}
const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)[,}]|<(\w+)>/g)].map((m) => m[1] ?? m[2]).sort();

describe('message files', () => {
  it('has one file per namespace and nothing else, in every locale folder', () => {
    for (const locale of readdirSync(dir)) {
      expect(LOCALES as readonly string[]).toContain(locale);
      const files = readdirSync(join(dir, locale)).map((f) => f.replace(/\.json$/, ''));
      expect(files.sort()).toEqual([...NAMESPACES].sort());
    }
  });

  it.each(LOCALES.filter((l) => l !== DEFAULT_LOCALE))(
    '%s has every English key with the same placeholders',
    (locale) => {
      for (const ns of NAMESPACES) {
        const en = read(DEFAULT_LOCALE, ns);
        const other = read(locale, ns);
        expect(keys(other).sort(), ns).toEqual(keys(en).sort());
        const get = (t: Tree, path: string) =>
          path.split('.').reduce<string | Tree>((n, k) => (n as Tree)[k]!, t) as string;
        for (const k of keys(en)) {
          expect(placeholders(get(other, k)), `${ns}.${k}`).toEqual(placeholders(get(en, k)));
        }
      }
    },
  );

  it('loads every namespace and falls back to English per key', async () => {
    const he = await loadMessages('he');
    expect(Object.keys(he).sort()).toEqual([...NAMESPACES].sort());
    expect(he.shell.nav.calls).toBe('שיחות');
  });
});
