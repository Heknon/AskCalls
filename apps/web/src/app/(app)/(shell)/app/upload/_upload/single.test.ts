import { describe, expect, it } from 'vitest';
import {
  callCount,
  defaultsFor,
  fromLocalInput,
  phoneValid,
  pickFiles,
  toLocalInput,
} from './single';

const file = (name: string, lastModified = Date.UTC(2026, 10, 1, 8, 0)) =>
  new File(['x'], name, { lastModified });

describe('callCount', () => {
  it('counts an audio file and its transcript as one call', () => {
    expect(callCount([file('a.m4a'), file('a.srt'), file('notes.pdf')])).toBe(1);
    expect(callCount([file('a.m4a'), file('b.m4a')])).toBe(2);
    expect(callCount([])).toBe(0);
  });
});

describe('pickFiles', () => {
  it('keeps one audio and one transcript, the newest of each, and flags other files', () => {
    const first = pickFiles({ audio: null, transcript: null }, [file('a.m4a'), file('notes.pdf')]);
    expect(first.picked.audio?.name).toBe('a.m4a');
    expect(first.unsupported).toBe(true);
    const second = pickFiles(first.picked, [file('a.srt'), file('b.wav')]);
    expect(second.picked).toMatchObject({
      audio: { name: 'b.wav' },
      transcript: { name: 'a.srt' },
    });
    expect(second.unsupported).toBe(false);
  });
});

describe('defaultsFor', () => {
  const contacts = [{ id: 'c1', name: 'Dana Levi', phones: ['+972525550134'], aliases: [] }];

  it('reads the number and time from a Samsung name, and the saved contact for it', () => {
    const f = defaultsFor(
      { audio: file('Call recording 0525550134_261112_143200.m4a'), transcript: null },
      { region: 'IL', contacts, utcOffsetMinutes: 0 },
    );
    expect(f.phone).toBe('+972 52-555-0134');
    expect(fromLocalInput(f.startedAt)?.toISOString()).toBe('2026-11-12T14:32:00.000Z');
    expect(f.contactName).toBe('Dana Levi');
    expect(f.direction).toBe('unknown');
  });

  it('takes the name from an iPhone file and falls back to the file time', () => {
    const named = defaultsFor(
      { audio: null, transcript: file('Call with Yossi Mizrahi 2026-11-11.txt') },
      { region: 'IL', contacts, utcOffsetMinutes: 0 },
    );
    expect(named).toMatchObject({ phone: '', contactName: 'Yossi Mizrahi' });
    const plain = defaultsFor(
      { audio: file('voicemail.wav'), transcript: null },
      { region: 'IL', contacts, utcOffsetMinutes: 0 },
    );
    expect(plain).toMatchObject({ phone: '', contactName: '' });
    expect(plain.startedAt).toBe(toLocalInput(new Date(Date.UTC(2026, 10, 1, 8, 0))));
  });
});

describe('phoneValid', () => {
  it('accepts an empty field and numbers that parse', () => {
    expect(phoneValid('', 'IL')).toBe(true);
    expect(phoneValid('052-555-0134', 'IL')).toBe(true);
    expect(phoneValid('12', 'IL')).toBe(false);
  });
});
