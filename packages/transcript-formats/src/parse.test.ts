import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DomainError } from '@askcalls/domain';
import { describe, expect, it } from 'vitest';
import {
  buildTranscript,
  decodeText,
  detectFormat,
  normalizeSegments,
  parseTimecode,
  parseTranscript,
  parseTxt,
  toSrt,
  toTxt,
} from './index';

const FIXTURES = join(import.meta.dirname, '..', 'test', 'fixtures');
const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');
const bytes = (name: string) => new Uint8Array(readFileSync(join(FIXTURES, name)));

describe('decodeText', () => {
  it('strips a UTF-8 BOM and normalizes CRLF and CR', () => {
    const input = new TextEncoder().encode('\ufeffשלום\r\nworld\rend');
    expect(decodeText(input)).toBe('שלום\nworld\nend');
  });
  it('decodes UTF-16 LE and BE with BOM', () => {
    const text = 'דני: hello\r\n';
    const le = new Uint8Array(2 + text.length * 2);
    const be = new Uint8Array(2 + text.length * 2);
    le.set([0xff, 0xfe]);
    be.set([0xfe, 0xff]);
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      le[2 + i * 2] = c & 0xff;
      le[3 + i * 2] = c >> 8;
      be[2 + i * 2] = c >> 8;
      be[3 + i * 2] = c & 0xff;
    }
    expect(decodeText(le)).toBe('דני: hello\n');
    expect(decodeText(be.buffer)).toBe('דני: hello\n');
  });
  it('strips a BOM from strings', () => {
    expect(decodeText('\ufeffWEBVTT')).toBe('WEBVTT');
  });
});

describe('parseTimecode', () => {
  it.each([
    ['00:00:01,500', 1.5],
    ['01:02:03.250', 3723.25],
    ['02:03.4', 123.4],
    ['1:05', 65],
    ['0:00:07', 7],
    ['100:00:00,000', 360_000],
  ])('%s → %d', (tc, sec) => expect(parseTimecode(tc)).toBeCloseTo(sec, 6));
  it.each(['', 'abc', '1:75', '12', '01:61:00'])('rejects %j', (tc) =>
    expect(parseTimecode(tc)).toBeNull(),
  );
});

describe('TXT', () => {
  it('parses "Speaker: text" with continuation lines', () => {
    const r = parseTranscript(fixture('speakers.txt'), { filename: 'call.txt' });
    expect(r.format).toBe('txt');
    expect(r.timed).toBe(false);
    expect(r.durationSec).toBeNull();
    const segs = r.transcript.segments;
    expect(segs).toHaveLength(7);
    expect(segs[0]).toMatchObject({ speaker: 'נציג', start: 0, end: 0 });
    expect(segs[1]!.speaker).toBe('לקוח');
    expect(segs[1]!.text).toBe(
      'היי יוסי, אני מתקשר לגבי ההזמנה שלי, מספר 48213. ההזמנה עדיין לא הגיעה ועבר כבר שבוע.',
    );
    // "10:00" inside the text is not a speaker or a timestamp.
    expect(segs[5]!.text).toBe('לפי המערכת, מחר בין 10:00 ל-14:00.');
    expect(r.transcript.text.split('\n')).toHaveLength(7);
  });

  it('parses "[hh:mm:ss] Speaker: text" with timed ends', () => {
    const r = parseTranscript(fixture('timestamps.txt'));
    expect(r.timed).toBe(true);
    const segs = r.transcript.segments;
    expect(segs).toHaveLength(7);
    expect(segs[0]).toEqual({
      start: 1,
      end: 5,
      speaker: 'Dana',
      text: 'Hi, this is Dana from Blue Sky Realty. Is this a good time?',
    });
    expect(segs[5]).toMatchObject({ start: 62, end: 69, speaker: 'Michael' });
    expect(segs[5]!.text).toBe('אוקיי, אפשר לקבוע סיור ביום שלישי? And can my wife join?');
    // The last segment's end is estimated from its word count.
    expect(segs[6]!.end).toBeGreaterThan(69);
    expect(r.durationSec).toBe(segs[6]!.end);
  });

  it('parses Otter-style header lines', () => {
    const segs = parseTranscript(fixture('otter.txt')).transcript.segments;
    expect(segs.map((s) => [s.speaker, s.start])).toEqual([
      ['Speaker 1', 3],
      ['Speaker 2', 8],
      ['Speaker 1', 17],
      ['Speaker 2', 64],
    ]);
    expect(segs[1]!.text).toBe(
      'בוקר טוב. I need to talk to a lawyer about a rental contract. The landlord wants to keep the deposit.',
    );
    expect(segs[0]!.end).toBe(8);
  });

  it('keeps plain prose as one segment per line, without inventing speakers', () => {
    const segs = parseTranscript(fixture('plain.txt')).transcript.segments;
    expect(segs).toHaveLength(4);
    expect(segs.every((s) => s.speaker === undefined)).toBe(true);
    expect(segs[1]!.text).toBe('Note: we discussed the Electra model, not the Tadiran one.');
    expect(segs[3]!.text).toBe('We agreed to talk again on Sunday at 10:30.');
  });

  it('reads bare leading times when most lines have one', () => {
    const segs = parseTxt('00:05 - Agent: hello\n00:09 - Client: שלום\n00:15 Agent: bye');
    expect(segs.map((s) => [s.start, s.speaker, s.text])).toEqual([
      [5, 'Agent', 'hello'],
      [9, 'Client', 'שלום'],
      [15, 'Agent', 'bye'],
    ]);
  });

  it('reads "Speaker (00:01:02): text"', () => {
    const segs = parseTxt('Rina (00:00:02): בוקר טוב\nYoav (00:00:04): morning');
    expect(segs.map((s) => [s.start, s.end, s.speaker])).toEqual([
      [2, 4, 'Rina'],
      [4, segs[1]!.end, 'Yoav'],
    ]);
  });

  it('handles BOM + CRLF', () => {
    const crlf = new TextEncoder().encode(
      `\ufeff${fixture('speakers.txt').replace(/\n/g, '\r\n')}`,
    );
    const r = parseTranscript(crlf, { filename: 'x.txt' });
    expect(r.transcript.segments[0]!.speaker).toBe('נציג');
    expect(r.transcript.text).not.toMatch(/\r|\ufeff/);
  });
});

describe('SRT', () => {
  it('parses cues, strips markup, sorts unsorted cues and splits dialogue', () => {
    const r = parseTranscript(fixture('sample.srt'), { filename: 'call.srt' });
    expect(r.format).toBe('srt');
    const segs = r.transcript.segments;
    expect(segs.map((s) => s.start)).toEqual([0.5, 3.4, 8.1, 12, 15.6, 18.5, 18.5]);
    expect(segs[0]).toEqual({
      start: 0.5,
      end: 3.2,
      speaker: 'נציגה',
      text: 'שלום, מדברת רונית מחברת הביטוח.',
    });
    expect(segs[1]!.text).toBe(
      'Hi Ronit, I had a car accident yesterday and I want to open a claim.',
    );
    expect(segs[4]).toMatchObject({
      speaker: 'לקוח',
      text: "כן, 7730. I'll send the photos by email.",
    });
    expect(segs[5]).toMatchObject({ speaker: 'נציגה', text: 'מעולה.' });
    expect(segs[6]).toMatchObject({ speaker: 'לקוח', text: 'תודה רבה.' });
    // Overlapping cues (15.6–19.0 and 18.5–21.0) are kept.
    expect(segs[4]!.end).toBeGreaterThan(segs[5]!.start);
  });

  it('handles BOM + CRLF and detects SRT content saved as .txt', () => {
    const crlf = new TextEncoder().encode(`\ufeff${fixture('sample.srt').replace(/\n/g, '\r\n')}`);
    const r = parseTranscript(crlf, { filename: 'export.txt' });
    expect(r.format).toBe('srt');
    expect(r.transcript.segments).toHaveLength(7);
  });

  it('keeps a cue whose text is a number', () => {
    const r = parseTranscript(
      '1\n00:00:01,000 --> 00:00:02,000\n42\n\n2\n00:00:03,000 --> 00:00:04,000\nok\n',
    );
    expect(r.transcript.segments.map((s) => s.text)).toEqual(['42', 'ok']);
  });
});

describe('VTT', () => {
  it('parses voices, entities, inline timestamps and skips header, NOTE and STYLE', () => {
    const r = parseTranscript(bytes('sample.vtt'), { filename: 'meeting.vtt' });
    expect(r.format).toBe('vtt');
    const segs = r.transcript.segments;
    expect(segs.map((s) => [s.start, s.speaker, s.text])).toEqual([
      [0, 'Avi Cohen', 'שלום לכולם, thanks for joining the call.'],
      [4.5, 'Noa', 'Hi Avi. אני רוצה לדבר על הצעת המחיר & the timeline.'],
      [9.2, 'Avi Cohen', 'בטח.'],
      [9.2, 'Noa', 'Can we get a discount?'],
      [14, 'Avi Cohen', 'נבדוק ונחזור אלייך עד מחר <בצהריים>.'],
    ]);
    expect(segs[0]!.end).toBe(4.25);
  });

  it('falls back to "Name: text" when cues have no voice tags', () => {
    const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.000\nדני: היי\n\n00:02.000 --> 00:03.000\nRon: hi\n';
    expect(parseTranscript(vtt).transcript.segments.map((s) => s.speaker)).toEqual(['דני', 'Ron']);
  });
});

describe('JSON', () => {
  it('OpenAI Whisper verbose_json', () => {
    const r = parseTranscript(fixture('whisper-openai.json'), { filename: 'a.json' });
    expect(r.format).toBe('whisper-json');
    expect(r.language).toBe('hebrew');
    expect(r.transcript.segments).toHaveLength(3);
    expect(r.transcript.segments[0]).toEqual({
      start: 0,
      end: 4.2,
      text: 'שלום, אני מתקשרת בקשר למנוי לחדר הכושר.',
    });
    expect(r.durationSec).toBe(21.48);
  });

  it('OpenAI Whisper plain json (text only)', () => {
    const r = parseTranscript(
      '{"text":"שלום עולם","task":"transcribe","language":"he","duration":3}',
    );
    expect(r.format).toBe('whisper-json');
    expect(r.transcript.segments).toEqual([{ start: 0, end: 3, text: 'שלום עולם' }]);
  });

  it('whisper.cpp output (offsets in ms, timestamps fallback)', () => {
    const r = parseTranscript(fixture('whisper-cpp.json'));
    expect(r.format).toBe('whisper-json');
    expect(r.language).toBe('he');
    expect(r.transcript.segments.map((s) => [s.start, s.end])).toEqual([
      [0, 3.64],
      [3.64, 8.12],
      [8.12, 12.5],
    ]);
    expect(r.transcript.segments[2]!.text).toBe('החשבון יוצא 1,850 שקל כולל מע״מ.');
  });

  it('Deepgram utterances', () => {
    const r = parseTranscript(fixture('deepgram-utterances.json'));
    expect(r.format).toBe('deepgram-json');
    expect(r.language).toBe('he');
    expect(r.transcript.segments.map((s) => [s.speaker, s.text])).toEqual([
      ['Speaker 0', 'בוקר טוב, אני רוצה לקבוע תור לטכנאי.'],
      ['Speaker 1', "Sure, what's your address?"],
      ['Speaker 0', 'רחוב הרצל 12, חולון.'],
    ]);
  });

  it('Deepgram multichannel words, grouped by pauses and merged by time', () => {
    const r = parseTranscript(fixture('deepgram-words.json'));
    expect(r.format).toBe('deepgram-json');
    expect(r.transcript.segments.map((s) => [s.start, s.speaker, s.text])).toEqual([
      [0.1, 'Channel 0', 'Hello, this is the bank.'],
      [1.8, 'Channel 1', 'שלום, כן.'],
      [5.2, 'Channel 0', 'ההלוואה אושרה.'],
      [7, 'Channel 1', 'Great!'],
    ]);
  });

  it('AssemblyAI utterances (ms)', () => {
    const r = parseTranscript(fixture('assemblyai.json'));
    expect(r.format).toBe('assemblyai-json');
    expect(r.transcript.segments).toEqual([
      {
        start: 0.24,
        end: 5.1,
        speaker: 'Speaker A',
        text: "שלום, אני רוצה לבטל את המנוי. I've been charged twice this month.",
      },
      { start: 5.6, end: 9.9, speaker: 'Speaker B', text: 'אני מתנצל, נבדוק את זה מיד.' },
    ]);
  });

  it('AssemblyAI words without utterances', () => {
    const json = JSON.stringify({
      audio_duration: 3,
      text: 'hi there',
      words: [
        { text: 'hi', start: 0, end: 300, speaker: null },
        { text: 'there', start: 350, end: 800, speaker: null },
      ],
    });
    expect(parseTranscript(json).transcript.segments).toEqual([
      { start: 0, end: 0.8, text: 'hi there' },
    ]);
  });

  it('ElevenLabs Scribe words with spacing and audio events', () => {
    const r = parseTranscript(fixture('elevenlabs.json'));
    expect(r.format).toBe('elevenlabs-json');
    expect(r.language).toBe('heb');
    expect(r.transcript.segments.map((s) => [s.speaker, s.text])).toEqual([
      ['Speaker 0', 'שלום, מה שלומך?'],
      ['Speaker 1', 'Fine, thanks.'],
      ['Speaker 0', 'יופי.'],
    ]);
  });

  it('generic segments array: unsorted, empty dropped', () => {
    const r = parseTranscript(fixture('segments.json'));
    expect(r.format).toBe('segments-json');
    expect(r.transcript.segments.map((s) => [s.start, s.speaker])).toEqual([
      [0, 'Agent'],
      [4.2, 'Customer'],
      [12.5, 'Customer'],
      [15.4, 'Agent'],
    ]);
  });

  it('generic wrapped list with millisecond keys and numeric speakers', () => {
    const r = parseTranscript(fixture('segments-ms.json'));
    expect(r.format).toBe('segments-json');
    expect(r.language).toBe('en');
    expect(r.transcript.segments).toEqual([
      { start: 0, end: 3.5, speaker: 'Speaker 1', text: 'Thanks for calling Shufersal online.' },
      { start: 3.6, end: 9.1, speaker: 'Speaker 2', text: 'ההזמנה שלי הגיעה בלי החלב והביצים.' },
    ]);
  });

  it('generic segments with string timecodes and durations', () => {
    const r = parseTranscript(
      JSON.stringify({
        segments: [
          { start: '00:00:02.5', text: 'a' },
          { start: 4, duration: 2, text: 'b' },
        ],
      }),
    );
    expect(r.transcript.segments).toEqual([
      { start: 2.5, end: 2.5, text: 'a' },
      { start: 4, end: 6, text: 'b' },
    ]);
  });

  it('rejects unknown JSON and malformed JSON with content-free errors', () => {
    expect(() => parseTranscript('{"foo": 1}', { filename: 'x.json' })).toThrow(DomainError);
    try {
      parseTranscript('{"secret": "דני כהן 0541234567"}');
    } catch (e) {
      expect((e as DomainError).code).toBe('unsupported');
      expect((e as Error).message).not.toContain('דני');
    }
    expect(() =>
      parseTranscript('{"text": ', { filename: 'x.json', format: 'whisper-json' }),
    ).toThrow(/could not be parsed/);
  });

  it('rejects empty input', () => {
    expect(() => parseTranscript('\ufeff  \n')).toThrow(DomainError);
  });
});

describe('detectFormat', () => {
  it.each([
    ['WEBVTT\n\n00:01.000 --> 00:02.000\nhi', undefined, 'vtt'],
    ['1\n00:00:01,000 --> 00:00:02,000\nhi', 'a.txt', 'srt'],
    ['00:01.000 --> 00:02.000\nhi', 'a.vtt', 'vtt'],
    ['hello', 'a.srt', 'srt'],
    ['hello', 'a.txt', 'txt'],
    ['[00:00:01] a: b', undefined, 'txt'],
    ['[{"start":0,"end":1,"text":"x"}]', undefined, 'segments-json'],
  ])('%j (%s) → %s', (content, filename, expected) => {
    expect(detectFormat(content, filename)?.format).toBe(expected);
  });
});

describe('normalizeSegments / buildTranscript', () => {
  it('fixes negative and inverted times and collapses whitespace', () => {
    expect(
      normalizeSegments([
        { start: 5, end: 3, text: '  a\n b ' },
        { start: -1, end: Number.NaN, text: 'c', speaker: '  ' },
      ]),
    ).toEqual([
      { start: 0, end: 0, text: 'c' },
      { start: 5, end: 5, text: 'a b' },
    ]);
  });
  it('joins text by newline', () => {
    expect(
      buildTranscript([
        { start: 0, end: 1, text: 'א' },
        { start: 1, end: 2, text: 'b' },
      ]).text,
    ).toBe('א\nb');
  });
});

describe('export', () => {
  it('TXT round-trips through the parser', () => {
    const original = parseTranscript(fixture('timestamps.txt')).transcript;
    const txt = toTxt(original);
    expect(txt.split('\n')[0]).toBe(
      '[00:00:01] Dana: Hi, this is Dana from Blue Sky Realty. Is this a good time?',
    );
    const again = parseTranscript(txt).transcript;
    expect(again.segments.map((s) => [s.start, s.speaker, s.text])).toEqual(
      original.segments.map((s) => [s.start, s.speaker, s.text]),
    );
  });

  it('TXT without timestamps for untimed transcripts', () => {
    const t = parseTranscript(fixture('speakers.txt')).transcript;
    expect(toTxt(t).startsWith('נציג: שלום')).toBe(true);
    expect(toTxt(t, { speakers: false }).startsWith('שלום')).toBe(true);
  });

  it('SRT round-trips through the parser', () => {
    const original = parseTranscript(fixture('sample.vtt')).transcript;
    const srt = toSrt(original);
    expect(srt.startsWith('1\n00:00:00,000 --> 00:00:04,250\nAvi Cohen: שלום לכולם')).toBe(true);
    const again = parseTranscript(srt).transcript;
    expect(again.segments).toEqual(original.segments);
  });

  it('SRT estimates times for untimed transcripts', () => {
    const srt = toSrt(parseTranscript('שלום לך\nמה נשמע היום?').transcript);
    expect(srt).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\nשלום לך\n\n2\n00:00:01,000 --> 00:00:02,200\nמה נשמע היום?\n',
    );
  });
});
