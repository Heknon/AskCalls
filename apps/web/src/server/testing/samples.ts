/**
 * Sample calls for client-core tests. Each carries distinctive words, names and numbers so the
 * leak test can look for them in every stored byte.
 */
export const ENGLISH_CALL = {
  fileName: 'orbitex-quote.txt',
  phone: '054-765-4321',
  e164: '+972547654321',
  contactName: 'Zephyrine Quillfeather',
  startedAt: '2026-06-10T09:30:00Z',
  text: [
    '[00:00:01] Agent: Hello, this is Marcus from Orbitex Solar. I am calling about your quote.',
    '[00:00:09] Customer: Yes, I wanted forty photovoltaic panels on the warehouse roof.',
    '[00:00:17] Agent: The price per panel is 1,250 shekels with installation included.',
    '[00:00:26] Customer: Send me the contract by Thursday and we can sign it.',
    '[00:00:34] Agent: Will do. Your reference number is 88412093.',
  ].join('\n'),
  words: ['Orbitex', 'photovoltaic', 'warehouse', 'Marcus', '88412093'],
};

export const HEBREW_CALL = {
  fileName: 'gilboa.srt',
  phone: '+972 3-555-1290',
  e164: '+97235551290',
  contactName: 'יהונתן גלבועי',
  startedAt: '2026-06-11T14:00:00Z',
  text: [
    '1',
    '00:00:01,000 --> 00:00:05,000',
    'שלום, מדבר יוסי מחברת אגוזית',
    '',
    '2',
    '00:00:05,500 --> 00:00:10,000',
    'רציתי לשאול לגבי ההזמנה של המקררים לסניף בחולון',
    '',
    '3',
    '00:00:10,500 --> 00:00:15,000',
    'המשלוח של השקשוקיות יגיע ביום שלישי בבוקר',
    '',
  ].join('\n'),
  words: ['אגוזית', 'המקררים', 'מקררים', 'בחולון', 'השקשוקיות'],
};

export const INBOX_CALL = {
  phone: '052-918-3746',
  e164: '+972529183746',
  contactName: 'Bartholomew Nightingale',
  text: 'Caller asked about the Xylophonix subscription renewal and the overdue invoice 55120987.',
  words: ['Xylophonix', 'subscription', 'Bartholomew', '55120987'],
};

export const TAG_NAME = 'Platypus Leads';
export const NOTES = 'Follow up with Quintessa about the Marmalade contract';
