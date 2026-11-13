import { TRANSCRIPT_EXTENSIONS } from '@askcalls/transcript-formats';
import { MANIFEST_COLUMNS, MANIFEST_DIRECTIONS } from './manifest';
import { AUDIO_EXTENSIONS, MANIFEST_NAME } from './pairing';

/** An example import folder, one path per line. */
export const EXAMPLE_TREE = [
  'calls/',
  `├─ ${MANIFEST_NAME}`,
  '├─ 2026-03-01 Dana.mp3',
  '├─ 2026-03-01 Dana.txt',
  '├─ 2026-03-02 Ron.m4a',
  '├─ 2026-03-02 Ron.transcript.json',
  '└─ clinic/',
  '   └─ 2026-03-05 Front desk.wav',
].join('\n');

/** The manifest.csv of the example folder. */
export const EXAMPLE_MANIFEST = [
  MANIFEST_COLUMNS.join(','),
  '2026-03-01 Dana.mp3,+972501234567,2026-03-01T14:05:00+02:00,in,Dana Levi,supplier;fridges',
  '2026-03-02 Ron.m4a,+972527654321,2026-03-02 07:30,out,Ron Cohen,legal',
  'clinic/2026-03-05 Front desk.wav,+97235550134,2026-03-05 09:00,in,,clinic',
].join('\n');

const COLUMN_NOTES: Record<(typeof MANIFEST_COLUMNS)[number], string> = {
  file: 'Required. The recording or the transcript of the call: its path inside the folder, its file name, or its name without the extension. Letter case is ignored.',
  phone:
    'The other party, with country code (+972501234567). A local number is read in the region set in Settings.',
  started_at:
    'ISO 8601 with an offset (2026-03-01T14:05:00+02:00), or YYYY-MM-DD HH:MM[:SS] or YYYY-MM-DD, read as UTC.',
  direction: `One of: ${Object.keys(MANIFEST_DIRECTIONS).join(', ')} (any letter case).`,
  contact_name: 'The name to show for the other party.',
  tags: 'Tag names separated by ; or |. Missing tags are created.',
};

const list = (xs: readonly string[]) => xs.map((x) => `.${x.replace(/^\./, '')}`).join(' ');

/**
 * The folder layout and manifest.csv an import reads, for an AI agent or a person preparing a
 * folder from another layout. Built from the same constants the parser uses.
 */
export function importFormatGuide(): string {
  return `# Importing calls into AskCalls

## Folder

- Put the recordings and transcripts in one folder (subfolders are fine) or a ZIP.
- Audio: ${list(AUDIO_EXTENSIONS)}
- Transcripts: ${list(TRANSCRIPT_EXTENSIONS)}. JSON from Whisper, Deepgram or AssemblyAI, or {"segments":[{"start":0,"end":4.2,"speaker":"Dana","text":"…"}]}. Text lines may be plain, "Speaker: text", "[00:01:02] Speaker: text" or "00:01:02 - Speaker: text".
- One call is a recording and a transcript with the same name in the same folder. The match ignores letter case and the extension, and a transcript name may end in .transcript, -transcript, _transcript or _tx (call.mp3 + call.transcript.json).
- The same name in two folders is two calls.
- A recording without a transcript is transcribed. A transcript without a recording is imported as text only.
- Other files are skipped, and so is a second recording or transcript with the same name.
- Without a manifest, Samsung ("Call recording Dana_260301_140500.m4a"), iPhone ("Call with Dana 2026-03-01 at 14.05.m4a") and similar Android recording names give the date, number and name.

## manifest.csv

Optional. Name it ${MANIFEST_NAME} at the top of the folder, or pass its path (--manifest, or manifest_path in MCP). One row per call; its values replace anything read from file names.

- The first row is the header. Columns may come in any order; unknown columns are ignored.
- Separate fields with commas or semicolons. Quote a field that contains the separator, a quote ("") or a line break.
- UTF-8, with or without a byte-order mark.

| Column | What it takes |
| --- | --- |
${MANIFEST_COLUMNS.map((c) => `| ${c} | ${COLUMN_NOTES[c]} |`).join('\n')}

## Example

\`\`\`
${EXAMPLE_TREE}
\`\`\`

\`\`\`csv
${EXAMPLE_MANIFEST}
\`\`\`

## Check before importing

Run a dry run (askcalls ingest <folder> --dry-run, or ingest_batch with dry_run: true). It sends nothing and lists:
- each call with its files, manifest line and the metadata it would get;
- skipped files: unsupported, extra_audio or extra_transcript (a second file for a name that already has one);
- manifest issues by line: missing_file (no file value), bad_date, bad_direction, duplicate_file (a file listed twice);
- manifest rows that match no file, and calls no row describes.

Calls already in AskCalls are found during the import and skipped as duplicates.
`;
}
