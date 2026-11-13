# @askcalls/transcript-formats

Parses transcript files into `Transcript { segments, text }` (types from `@askcalls/domain`) and
exports them back to TXT and SRT. Isomorphic: runs unchanged in the browser and Node 20+.

## API

```ts
import { parseTranscript, toTxt, toSrt } from '@askcalls/transcript-formats';

const { format, transcript, timed, language, durationSec } = parseTranscript(bytesOrString, {
  filename: 'call.srt', // optional, used as a tie-breaker for detection
  format: 'srt',        // optional, skips detection
});

toTxt(transcript);                  // "[00:01:02] Speaker: text" per line
toTxt(transcript, { timestamps: false, speakers: false });
toSrt(transcript);                  // SubRip; untimed transcripts get estimated times
```

- `parseTranscript(input: string | Uint8Array | ArrayBuffer, opts?)` decodes (UTF-8, UTF-16 LE/BE
  with BOM), detects, parses and normalizes. Throws `DomainError('invalid' | 'unsupported')` with a
  content-free message.
- `detectFormat(content, filename?)` returns `{ format, json? }` or null. Content wins over the
  extension (an SRT saved as `.txt` is SRT); the extension breaks ties.
- Lower-level: `decodeText`, `parseTxt`, `parseSrt`, `parseVtt`, `parseJson`, `parseJsonValue`,
  `detectJsonFormat`, `normalizeSegments`, `buildTranscript`, `parseTimecode`, `formatSrtTime`,
  `formatClock`.

`timed` is false for plain text without times: every segment is at 0 and `durationSec` is null.
`language` is whatever the source reported (Whisper, Deepgram, AssemblyAI, ElevenLabs), unmapped.

## Formats

| `format` | Source |
| --- | --- |
| `txt` | Plain text (one segment per line); `Speaker: text` (unprefixed lines continue the turn); `[00:01:02] Speaker: text`, `(01:02) text`, `00:01:02 - Speaker: text` (bare times only when most lines have one); `Speaker [00:01:02]: text`; header lines `Speaker 1  0:03` followed by the text (Otter and similar) |
| `srt` | SubRip. Markup (`<i>`, `<font>`, `{\an8}`) stripped; `- ` dialogue lines split into separate segments; cue numbers optional |
| `vtt` | WebVTT. Header, `NOTE`, `STYLE`, `REGION` skipped; `<v Name>` / `<v.class Name>` voices (several per cue become several segments); inline timestamps and tags stripped; entities decoded |
| `whisper-json` | OpenAI `verbose_json` (and plain `json`), whisper.cpp `-oj` output (`offsets` in ms, `timestamps` fallback) |
| `deepgram-json` | `results.utterances`, else `channels[].alternatives[0].words` grouped into turns; multichannel labelled `Channel N` |
| `assemblyai-json` | `utterances` (ms), else `words`, else `text` |
| `elevenlabs-json` | Scribe `words` with `spacing` and `audio_event` tokens (events dropped), and multichannel `transcripts` |
| `segments-json` | Any array of `{ start, end, text, speaker? }`, bare or under `segments` / `utterances` / `items` / …; key aliases (`start_time`, `startMs`, `transcript`, `speaker_id` …), string timecodes, `duration`, milliseconds detected by `_ms` keys or integer times over 10 hours |

Speakers: numeric or single-letter labels become `Speaker 0` / `Speaker A`; names pass through.
A `Label:` prefix is read as a speaker only when the label is 1–4 words of letters, digits and
`._'’-` and at least half the lines carry one, so prose like `Note: …` stays text.

Word-level JSON is grouped into segments on a speaker change, a pause of 1.5 s, or after 60 words at
a sentence end.

## Normalization

All parsers go through `normalizeSegments`: whitespace collapsed, empty segments dropped, negative
or missing times clamped to 0, `end >= start`, stable sort by start. Overlapping cues are kept.
Hebrew, RTL marks and mixed-direction text are preserved as-is (the UI renders with `dir="auto"`).
`text` is the segment texts joined by newlines.

## Fixtures

`test/fixtures` has a realistic mixed Hebrew/English sample for every format; tests also derive
BOM + CRLF and UTF-16 variants from them.
