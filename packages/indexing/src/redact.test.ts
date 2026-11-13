import { describe, expect, it } from 'vitest';
import { parsePhone } from './phone';
import { createRedactor, isIbanValid, isIsraeliIdValid, isLuhnValid, redact } from './redact';

/** Appends the Luhn check digit. */
function withLuhn(body: string): string {
  for (let d = 0; d <= 9; d++) if (isLuhnValid(body + d)) return body + d;
  throw new Error('unreachable');
}
/** Appends the Israeli ID check digit to 8 digits. */
function withIdCheck(body: string): string {
  for (let d = 0; d <= 9; d++) if (isIsraeliIdValid(body + d)) return body + d;
  throw new Error('unreachable');
}

const VALID_CARD = withLuhn('458012345678901'); // 16 digits
const VALID_ID = withIdCheck('12345678');
const INVALID_ID = VALID_ID.slice(0, 8) + ((Number(VALID_ID[8]) + 1) % 10);

describe('checksums', () => {
  it('Luhn', () => {
    expect(isLuhnValid('4111111111111111')).toBe(true);
    expect(isLuhnValid('4111111111111112')).toBe(false);
    expect(isLuhnValid('79927398713')).toBe(true);
  });
  it('Israeli ID', () => {
    expect(isIsraeliIdValid('123456782')).toBe(true);
    expect(isIsraeliIdValid('123456789')).toBe(false);
    expect(isIsraeliIdValid('000000018')).toBe(true);
    expect(isIsraeliIdValid('000000000')).toBe(false);
    expect(isIsraeliIdValid(VALID_ID)).toBe(true);
    expect(isIsraeliIdValid(INVALID_ID)).toBe(false);
  });
  it('IBAN', () => {
    expect(isIbanValid('IL62 0108 0000 0009 9999 999')).toBe(true);
    expect(isIbanValid('GB82 WEST 1234 5698 7654 32')).toBe(true);
    expect(isIbanValid('DE89370400440532013000')).toBe(true);
    expect(isIbanValid('IL62 0108 0000 0009 9999 998')).toBe(false);
  });
});

/** [text, expected redacted text] — true positives. */
const TRUE_POSITIVES: Array<[string, string]> = [
  ['התקשר אליי ל-054-123-4567 בבקשה', 'התקשר אליי ל-[PHONE] בבקשה'],
  ['call me at +972 54 123 4567', 'call me at [PHONE]'],
  ['המספר 0541234567', 'המספר [PHONE]'],
  ['המספר שלי ٠٥٤١٢٣٤٥٦٧', 'המספר שלי [PHONE]'],
  ['office (03) 123-4567', 'office [PHONE]'],
  ['UK number +44 20 7946 0958 ok', 'UK number [PHONE] ok'],
  ['054 123 45 67 זה הנייד', '[PHONE] זה הנייד'],
  ['שירות לקוחות 1-800-500-500', 'שירות לקוחות [PHONE]'],
  ['wa 972541234567', 'wa [PHONE]'],
  ['email: dani.cohen+work@example.co.il.', 'email: [EMAIL].'],
  ['כתובת המייל היא רונית@דוגמה.ישראל', 'כתובת המייל היא [EMAIL]'],
  [`ת"ז ${VALID_ID} של הלקוח`, `ת"ז [ID] של הלקוח`],
  [`ID ${VALID_ID.slice(0, 8)}-${VALID_ID[8]}`, 'ID [ID]'],
  [`כרטיס ${VALID_CARD.replace(/(\d{4})(?=\d)/g, '$1 ')} תוקף`, 'כרטיס [CARD] תוקף'],
  [`card ${VALID_CARD.replace(/(\d{4})(?=\d)/g, '$1-')}`, 'card [CARD]'],
  ['amex 3782 822463 10005', 'amex [CARD]'],
  ['IBAN IL62 0108 0000 0009 9999 999 thanks', 'IBAN [IBAN] thanks'],
  ['חשבון IL620108000000099999999.', 'חשבון [IBAN].'],
  ['de89 3704 0044 0532 0130 00', '[IBAN]'],
];

/** Text that must come back unchanged — false-positive guards. */
const FALSE_POSITIVES: string[] = [
  'המחיר הוא 1,200,000 שקל',
  'נפגשים ב-12/03/2024 בשעה 10:30',
  'room 302, year 2024, amount 15000',
  `ת"ז ${INVALID_ID} לא תקין`,
  'כרטיס 4111 1111 1111 1112 לא עובר',
  'order number 48213',
  'reference 5551234567 in the system',
  'שלחתי 3 4 5 6 7 8 9 פריטים',
  'הזמנה 2024-11-13',
  'version 1.2.3',
  'GB00 WEST 1234 5698 7654 32 bad iban',
  'not an email: user@localhost',
  'twelve digits 123456789012 here',
  'ISBN 978-3-16-148410-0',
];

describe('redact: true positives', () => {
  it.each(TRUE_POSITIVES)('%j', (input, expected) => {
    expect(redact(input).text).toBe(expected);
  });
});

describe('redact: false positives', () => {
  it.each(FALSE_POSITIVES)('%j', (input) => {
    expect(redact(input).text).toBe(input);
  });
});

describe('redact: names', () => {
  const r = createRedactor({ names: ['דני כהן', 'Ronit Levi', "ג'ני", 'אור'] });

  it.each<[string, string]>([
    ['דני אמר שהוא יחזור', '[NAME] אמר שהוא יחזור'],
    ['תעביר לדני את ההצעה', 'תעביר ל[NAME] את ההצעה'],
    ['ולדני יש שאלה', 'ול[NAME] יש שאלה'],
    ['שלום ל\u05b0ד\u05b8נ\u05b4י', 'שלום ל\u05b0[NAME]'],
    ['משפחת כהן', 'משפחת [NAME]'],
    ['Ronit said hi', '[NAME] said hi'],
    ["that's Ronit's car", "that's [NAME]'s car"],
    ['RONIT LEVI', '[NAME] [NAME]'],
    ["דיברתי עם ג'ני", 'דיברתי עם [NAME]'],
    ['דיברתי עם ג׳ני', 'דיברתי עם [NAME]'],
    ['שאור', 'ש[NAME]'],
  ])('%j', (input, expected) => expect(r.redact(input).text).toBe(expected));

  it.each([
    'דניאל הגיע',
    'Ronnie and Ronita',
    'אדני הבית',
    'הדנים', // not דני
    'Levis jeans',
  ])('leaves %j alone', (input) => expect(r.redact(input).text).toBe(input));

  it('counts by kind and keeps the rest of the text', () => {
    const out = r.redact('דני: 054-1234567, dani@x.com, דני שוב');
    expect(out.text).toBe('[NAME]: [PHONE], [EMAIL], [NAME] שוב');
    expect(out.counts).toEqual({ EMAIL: 1, IBAN: 0, CARD: 0, ID: 0, PHONE: 1, NAME: 2 });
  });

  it('ignores stopwords and one-letter words in names', () => {
    const r2 = createRedactor({ names: ['The A Team', 'אמא של דני'] });
    expect(r2.redact('the team of a').text).toBe('the [NAME] of a');
    expect(r2.redact('אמא של דני').text).toBe('[NAME] של [NAME]');
  });

  it('uses the configured region for numbers without a country code', () => {
    expect(redact('call (650) 253-0000 now', { region: 'US' }).text).toBe('call [PHONE] now');
  });
});

describe('parsePhone', () => {
  it.each<[string, string | null]>([
    ['054-123-4567', '+972541234567'],
    ['0541234567', '+972541234567'],
    ['+972 54 123 4567', '+972541234567'],
    ['00972541234567', '+972541234567'],
    ['972541234567', '+972541234567'],
    ['(03) 123-4567', '+97231234567'],
    ['٠٥٤١٢٣٤٥٦٧', '+972541234567'],
    ['+1 (650) 253-0000', '+16502530000'],
    ['+44 20 7946 0958', '+442079460958'],
    ['12345', null],
    ['abc', null],
    ['', null],
  ])('%j → %j', (input, expected) => expect(parsePhone(input)).toBe(expected));

  it('honors the default region', () => {
    expect(parsePhone('650-253-0000', 'US')).toBe('+16502530000');
    expect(parsePhone('020 7946 0958', 'GB')).toBe('+442079460958');
  });
});
