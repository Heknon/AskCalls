import { describe, expect, it } from 'vitest';
import { intlLocale, localeDir, localeName } from './locales';
import { acceptedLanguages, resolveLocale } from './resolve';

describe('resolveLocale', () => {
  it('prefers the account setting over the cookie and the browser', () => {
    expect(resolveLocale({ account: 'he', cookie: 'en', acceptLanguage: 'en-US' })).toBe('he');
  });

  it('uses the cookie when the account has no setting', () => {
    expect(resolveLocale({ account: null, cookie: 'he', acceptLanguage: 'en' })).toBe('he');
  });

  it('skips an unsupported account or cookie value', () => {
    expect(resolveLocale({ account: 'xx', cookie: 'zz', acceptLanguage: 'he-IL' })).toBe('he');
  });

  it('reads Accept-Language by weight, then order, with regional and legacy tags', () => {
    expect(resolveLocale({ acceptLanguage: 'fr;q=0.9, he-IL;q=0.8, en;q=0.5' })).toBe('he');
    expect(resolveLocale({ acceptLanguage: 'en;q=0.4, iw;q=0.6' })).toBe('he');
    expect(resolveLocale({ acceptLanguage: 'de, en-GB, he' })).toBe('en');
  });

  it('ignores q=0 and wildcards and falls back to English', () => {
    expect(resolveLocale({ acceptLanguage: 'he;q=0, *' })).toBe('en');
    expect(resolveLocale({})).toBe('en');
    expect(resolveLocale({ acceptLanguage: 'garbage;;q=x' })).toBe('en');
  });

  it('orders accepted languages best first', () => {
    expect(acceptedLanguages('a;q=0.1, b, c;q=0.5')).toEqual(['b', 'c', 'a']);
  });
});

describe('locale facts', () => {
  it('derives direction from the language, so RTL languages drop in', () => {
    expect(localeDir('he')).toBe('rtl');
    expect(localeDir('ar')).toBe('rtl');
    expect(localeDir('ru')).toBe('ltr');
    expect(localeDir('en')).toBe('ltr');
  });

  it('names each language in itself and picks the Intl region', () => {
    expect(localeName('he')).toBe('עברית');
    expect(localeName('en')).toBe('English');
    expect(intlLocale('he')).toBe('he-IL');
    expect(intlLocale('ru')).toBe('ru');
  });
});
