/**
 * "Speaker: text" detection. A label is 1–4 words, at most 40 characters, starts with a letter and
 * holds only letters, digits, spaces and `._'’-` ("Speaker 1", "SPEAKER_00", "דני", "Dr. Cohen").
 */
const PREFIX = /^([^:：]{1,40}?)\s*[:：]\s*(.*)$/s;
const LABEL = /^[\p{L}][\p{L}\p{M}\p{N} ._'’-]*$/u;

export function isSpeakerLabel(label: string): boolean {
  const l = label.trim();
  if (l.length === 0 || l.length > 40 || !LABEL.test(l)) return false;
  return l.split(/\s+/).length <= 4;
}

export function splitSpeakerPrefix(line: string): { speaker: string; text: string } | null {
  const m = PREFIX.exec(line);
  if (!m) return null;
  const speaker = m[1]!.trim();
  const text = m[2]!.trim();
  if (!isSpeakerLabel(speaker) || text.startsWith('//')) return null;
  return { speaker, text };
}

/**
 * Decides whether "Label: text" prefixes in a set of lines are speakers. Requires at least half
 * the lines to carry one, so prose like "Note: the price changed" alone is not read as a speaker.
 */
export function hasSpeakerPrefixes(lines: readonly string[]): boolean {
  const candidates = lines.filter((l) => l.trim().length > 0);
  if (candidates.length === 0) return false;
  let hits = 0;
  for (const l of candidates) if (splitSpeakerPrefix(l)) hits++;
  return hits >= Math.max(1, candidates.length / 2);
}
