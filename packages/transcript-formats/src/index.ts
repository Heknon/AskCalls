/** Transcript parsers: TXT, SRT, VTT, JSON (Whisper, Deepgram, AssemblyAI, generic segments). */
export type TranscriptFormat =
  | 'txt'
  | 'srt'
  | 'vtt'
  | 'whisper-json'
  | 'deepgram-json'
  | 'assemblyai-json'
  | 'segments-json';
