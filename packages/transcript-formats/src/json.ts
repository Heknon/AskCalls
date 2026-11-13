import { DomainError, type TranscriptSegment } from '@askcalls/domain';
import { estimateDuration } from './segments';
import { parseTimecode } from './timecode';

export type JsonFormat =
  | 'whisper-json'
  | 'deepgram-json'
  | 'assemblyai-json'
  | 'elevenlabs-json'
  | 'segments-json';

export interface JsonParseResult {
  format: JsonFormat;
  segments: TranscriptSegment[];
  language: string | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
};
const lang = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** `speaker_0`, `0`, `A` → `Speaker 0` / `Speaker A`; real names pass through. */
export function speakerLabel(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return `Speaker ${v}`;
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const s = v.trim();
  const m = /^(?:speaker[ _-]?)?(\d+|[A-Z])$/i.exec(s);
  return m ? `Speaker ${m[1]!.toUpperCase()}` : s;
}

interface Word {
  text: string;
  start: number;
  end: number;
  speaker?: string;
  /** Text already carries its own spacing (ElevenLabs spacing tokens). */
  raw?: boolean;
}

/** Groups timed words into turns: new segment on speaker change, a pause of 1.5 s, or 60 words at a sentence end. */
export function groupWords(words: readonly Word[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let cur: { start: number; end: number; speaker?: string; parts: string[]; count: number } | null =
    null;
  const flush = () => {
    if (!cur) return;
    const text = cur.parts.join('').replace(/\s+/g, ' ').trim();
    if (text) {
      const seg: TranscriptSegment = { start: cur.start, end: cur.end, text };
      if (cur.speaker) seg.speaker = cur.speaker;
      segments.push(seg);
    }
    cur = null;
  };
  for (const w of words) {
    const prev = cur as typeof cur;
    if (
      prev &&
      (w.speaker !== prev.speaker ||
        w.start - prev.end >= 1.5 ||
        (prev.count >= 60 && /[.!?…]$/.test(prev.parts[prev.parts.length - 1]?.trim() ?? '')))
    ) {
      flush();
    }
    if (!cur) {
      cur = { start: w.start, end: w.end, parts: [], count: 0 };
      if (w.speaker) cur.speaker = w.speaker;
    }
    const c = cur as NonNullable<typeof cur>;
    c.parts.push(w.raw ? w.text : c.parts.length ? ` ${w.text}` : w.text);
    if (w.text.trim()) c.count++;
    c.end = Math.max(c.end, w.end);
  }
  flush();
  return segments;
}

function single(text: unknown, duration: unknown): TranscriptSegment[] {
  const t = str(text)?.trim();
  if (!t) return [];
  const d = num(duration);
  return [{ start: 0, end: d && d > 0 ? d : estimateDuration(t), text: t }];
}

// --- Whisper -------------------------------------------------------------------------------

function isWhisperCpp(j: unknown): j is Obj {
  return isObj(j) && Array.isArray(j.transcription);
}

function isOpenAiWhisper(j: unknown): j is Obj {
  if (!isObj(j)) return false;
  const first = arr(j.segments)[0];
  if (isObj(first) && ('avg_logprob' in first || 'no_speech_prob' in first || 'seek' in first)) {
    return true;
  }
  return (
    typeof j.text === 'string' &&
    (j.task === 'transcribe' || j.task === 'translate' || ('duration' in j && 'language' in j))
  );
}

function parseWhisperCpp(j: Obj): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const item of arr(j.transcription)) {
    if (!isObj(item)) continue;
    const offsets = isObj(item.offsets) ? item.offsets : {};
    const stamps = isObj(item.timestamps) ? item.timestamps : {};
    const fromMs = num(offsets.from);
    const toMs = num(offsets.to);
    const start =
      fromMs !== undefined ? fromMs / 1000 : (parseTimecode(str(stamps.from) ?? '') ?? 0);
    const end = toMs !== undefined ? toMs / 1000 : (parseTimecode(str(stamps.to) ?? '') ?? start);
    const seg: TranscriptSegment = { start, end, text: str(item.text) ?? '' };
    const speaker = speakerLabel(item.speaker);
    if (speaker) seg.speaker = speaker;
    out.push(seg);
  }
  return out;
}

function parseOpenAiWhisper(j: Obj): TranscriptSegment[] {
  const segments = arr(j.segments).filter(isObj);
  if (segments.length === 0) return single(j.text, j.duration);
  return segments.map((s) => {
    const seg: TranscriptSegment = {
      start: num(s.start) ?? 0,
      end: num(s.end) ?? num(s.start) ?? 0,
      text: str(s.text) ?? '',
    };
    const speaker = speakerLabel(s.speaker);
    if (speaker) seg.speaker = speaker;
    return seg;
  });
}

// --- Deepgram ------------------------------------------------------------------------------

function isDeepgram(j: unknown): j is Obj {
  return (
    isObj(j) &&
    isObj(j.results) &&
    (Array.isArray(j.results.channels) || Array.isArray(j.results.utterances))
  );
}

function parseDeepgram(j: Obj): { segments: TranscriptSegment[]; language: string | null } {
  const results = j.results as Obj;
  const channels = arr(results.channels).filter(isObj);
  const multichannel = channels.length > 1;
  const firstAlt = isObj(arr(channels[0]?.alternatives)[0])
    ? (arr(channels[0]!.alternatives)[0] as Obj)
    : {};
  const language =
    lang(channels[0]?.detected_language) ?? lang(firstAlt.languages && arr(firstAlt.languages)[0]);

  const label = (speaker: unknown, channel: unknown): string | undefined => {
    const s = num(speaker);
    const c = num(channel);
    if (s !== undefined)
      return multichannel && c !== undefined ? `Channel ${c} Speaker ${s}` : `Speaker ${s}`;
    if (multichannel && c !== undefined) return `Channel ${c}`;
    return undefined;
  };

  const utterances = arr(results.utterances).filter(isObj);
  if (utterances.length > 0) {
    const segments = utterances.map((u) => {
      const seg: TranscriptSegment = {
        start: num(u.start) ?? 0,
        end: num(u.end) ?? 0,
        text: str(u.transcript) ?? '',
      };
      const speaker = label(u.speaker, u.channel);
      if (speaker) seg.speaker = speaker;
      return seg;
    });
    return { segments, language };
  }

  const segments: TranscriptSegment[] = [];
  channels.forEach((ch, ci) => {
    const alt = arr(ch.alternatives).find(isObj);
    if (!alt) return;
    const words = arr(alt.words).filter(isObj);
    if (words.length === 0) {
      const meta = isObj(j.metadata) ? j.metadata : {};
      const s = single(alt.transcript, meta.duration);
      if (multichannel) for (const seg of s) seg.speaker = `Channel ${ci}`;
      segments.push(...s);
      return;
    }
    const mapped: Word[] = words.map((w) => {
      const word: Word = {
        text: str(w.punctuated_word) ?? str(w.word) ?? '',
        start: num(w.start) ?? 0,
        end: num(w.end) ?? 0,
      };
      const speaker = label(w.speaker, ci);
      if (speaker) word.speaker = speaker;
      return word;
    });
    segments.push(...groupWords(mapped));
  });
  return { segments, language };
}

// --- AssemblyAI ----------------------------------------------------------------------------

function isAssemblyAi(j: unknown): j is Obj {
  if (!isObj(j)) return false;
  if (
    'audio_duration' in j ||
    'language_code' in j ||
    'acoustic_model' in j ||
    'speaker_labels' in j
  ) {
    return Array.isArray(j.utterances) || Array.isArray(j.words) || typeof j.text === 'string';
  }
  const u = arr(j.utterances)[0];
  return (
    isObj(u) &&
    typeof u.speaker === 'string' &&
    Array.isArray(u.words) &&
    typeof u.text === 'string'
  );
}

function parseAssemblyAi(j: Obj): TranscriptSegment[] {
  const ms = (v: unknown) => (num(v) ?? 0) / 1000;
  const utterances = arr(j.utterances).filter(isObj);
  if (utterances.length > 0) {
    return utterances.map((u) => {
      const seg: TranscriptSegment = {
        start: ms(u.start),
        end: ms(u.end),
        text: str(u.text) ?? '',
      };
      const speaker = speakerLabel(u.speaker);
      if (speaker) seg.speaker = speaker;
      return seg;
    });
  }
  const words = arr(j.words).filter(isObj);
  if (words.length > 0) {
    return groupWords(
      words.map((w) => {
        const word: Word = { text: str(w.text) ?? '', start: ms(w.start), end: ms(w.end) };
        const speaker = speakerLabel(w.speaker);
        if (speaker) word.speaker = speaker;
        return word;
      }),
    );
  }
  return single(j.text, j.audio_duration);
}

// --- ElevenLabs Scribe ---------------------------------------------------------------------

function isElevenLabs(j: unknown): j is Obj {
  if (!isObj(j)) return false;
  if (Array.isArray(j.transcripts)) return j.transcripts.some(isElevenLabs);
  const w = arr(j.words)[0];
  return 'language_code' in j && isObj(w) && typeof w.type === 'string' && 'text' in w;
}

function parseElevenLabs(j: Obj): TranscriptSegment[] {
  const parts = Array.isArray(j.transcripts) ? j.transcripts.filter(isObj) : [j];
  const out: TranscriptSegment[] = [];
  parts.forEach((p, ci) => {
    const words: Word[] = [];
    for (const w of arr(p.words).filter(isObj)) {
      if (w.type === 'audio_event') continue;
      const word: Word = {
        text: str(w.text) ?? '',
        start: num(w.start) ?? 0,
        end: num(w.end) ?? num(w.start) ?? 0,
        raw: true,
      };
      const speaker =
        speakerLabel(w.speaker_id) ??
        (parts.length > 1 ? `Channel ${num(p.channel_index) ?? ci}` : undefined);
      if (speaker) word.speaker = speaker;
      // Spacing tokens join the previous word's turn rather than start one.
      if (w.type === 'spacing' && words.length > 0) {
        const prevSpeaker = words[words.length - 1]!.speaker;
        if (prevSpeaker) word.speaker = prevSpeaker;
        else delete word.speaker;
      }
      words.push(word);
    }
    out.push(...(words.length ? groupWords(words) : single(p.text, undefined)));
  });
  return out;
}

// --- Generic segments ----------------------------------------------------------------------

const START_KEYS = [
  'start',
  'start_time',
  'startTime',
  'begin',
  'from',
  'start_ms',
  'startMs',
  'offset',
];
const END_KEYS = ['end', 'end_time', 'endTime', 'stop', 'to', 'end_ms', 'endMs'];
const TEXT_KEYS = ['text', 'transcript', 'content', 'sentence', 'utterance'];
const SPEAKER_KEYS = [
  'speaker',
  'speaker_name',
  'speakerName',
  'speaker_label',
  'speaker_id',
  'speakerId',
  'name',
  'role',
];
const LIST_KEYS = ['segments', 'utterances', 'transcript', 'items', 'results', 'cues', 'turns'];

const pick = (o: Obj, keys: readonly string[]) => {
  for (const k of keys)
    if (k in o && o[k] !== null && o[k] !== undefined) return { key: k, value: o[k] };
  return null;
};

function genericList(j: unknown): Obj[] | null {
  const looksLikeSegment = (o: unknown) =>
    isObj(o) && pick(o, TEXT_KEYS) !== null && typeof pick(o, TEXT_KEYS)!.value === 'string';
  const candidates = Array.isArray(j)
    ? [j]
    : isObj(j)
      ? LIST_KEYS.map((k) => j[k]).filter(Array.isArray)
      : [];
  for (const list of candidates) {
    const objs = (list as unknown[]).filter(isObj);
    if (
      objs.length > 0 &&
      objs.length === (list as unknown[]).length &&
      objs.some(looksLikeSegment)
    ) {
      return objs;
    }
  }
  return null;
}

function timeValue(v: unknown): number | undefined {
  if (typeof v === 'string' && v.includes(':')) return parseTimecode(v) ?? undefined;
  return num(v);
}

function parseGeneric(list: Obj[]): TranscriptSegment[] {
  const rows = list.map((o) => {
    const s = pick(o, START_KEYS);
    const e = pick(o, END_KEYS);
    const duration = num(o.duration);
    return {
      start: s ? timeValue(s.value) : undefined,
      end: e ? timeValue(e.value) : undefined,
      duration,
      msKeys: /ms$/i.test(s?.key ?? '') || /ms$/i.test(e?.key ?? ''),
      text: str(pick(o, TEXT_KEYS)?.value) ?? '',
      speaker: speakerLabel(pick(o, SPEAKER_KEYS)?.value),
      stringTimes: typeof s?.value === 'string' && s.value.includes(':'),
    };
  });
  // Millisecond units: explicit `_ms` keys, or integer times implying a call longer than 10 hours.
  const numeric = rows.filter((r) => !r.stringTimes);
  const maxTime = Math.max(0, ...numeric.map((r) => Math.max(r.start ?? 0, r.end ?? 0)));
  const allInts = numeric.every(
    (r) => Number.isInteger(r.start ?? 0) && Number.isInteger(r.end ?? 0),
  );
  const ms = rows.some((r) => r.msKeys) || (allInts && maxTime > 36_000);
  return rows.map((r) => {
    const scale = ms && !r.stringTimes ? 1000 : 1;
    const start = (r.start ?? 0) / scale;
    const end =
      r.end !== undefined
        ? r.end / scale
        : r.duration !== undefined
          ? start + r.duration / scale
          : start;
    const seg: TranscriptSegment = { start, end, text: r.text };
    if (r.speaker) seg.speaker = r.speaker;
    return seg;
  });
}

// --- Entry points --------------------------------------------------------------------------

export function detectJsonFormat(j: unknown): JsonFormat | null {
  if (isDeepgram(j)) return 'deepgram-json';
  if (isElevenLabs(j)) return 'elevenlabs-json';
  if (isAssemblyAi(j)) return 'assemblyai-json';
  if (isWhisperCpp(j) || isOpenAiWhisper(j)) return 'whisper-json';
  if (genericList(j)) return 'segments-json';
  return null;
}

export function parseJsonValue(j: unknown, format?: JsonFormat): JsonParseResult {
  const detected = format ?? detectJsonFormat(j);
  if (!detected) throw new DomainError('unsupported', 'Unrecognized JSON transcript shape');
  const o: Obj = isObj(j) ? j : {};
  switch (detected) {
    case 'deepgram-json': {
      if (!isDeepgram(j)) break;
      const { segments, language } = parseDeepgram(o);
      return { format: detected, segments, language };
    }
    case 'elevenlabs-json':
      if (!isElevenLabs(j)) break;
      return {
        format: detected,
        segments: parseElevenLabs(o),
        language:
          lang(o.language_code) ??
          lang(isObj(arr(o.transcripts)[0]) ? (arr(o.transcripts)[0] as Obj).language_code : null),
      };
    case 'assemblyai-json':
      if (!isObj(j)) break;
      return { format: detected, segments: parseAssemblyAi(o), language: lang(o.language_code) };
    case 'whisper-json':
      if (isWhisperCpp(j)) {
        const result = isObj(o.result) ? o.result : {};
        return { format: detected, segments: parseWhisperCpp(o), language: lang(result.language) };
      }
      if (!isObj(j)) break;
      return { format: detected, segments: parseOpenAiWhisper(o), language: lang(o.language) };
    case 'segments-json': {
      const list = genericList(j);
      if (!list) break;
      return {
        format: detected,
        segments: parseGeneric(list),
        language: isObj(j) ? lang(j.language) : null,
      };
    }
  }
  throw new DomainError('invalid', 'JSON does not match the requested transcript format', {
    format: detected,
  });
}

export function parseJson(input: string, format?: JsonFormat): JsonParseResult {
  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch {
    throw new DomainError('invalid', 'Transcript JSON could not be parsed');
  }
  return parseJsonValue(value, format);
}
