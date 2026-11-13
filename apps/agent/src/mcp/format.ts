import type { ResolvedTag } from '@askcalls/client-core';
import { type CallMeta, type DurationBucket, dateFromDay, wrapTranscript } from '@askcalls/domain';

export const DURATION_LABELS: Record<DurationBucket, string> = {
  0: 'under 1 min',
  1: '1–5 min',
  2: '5–15 min',
  3: '15–60 min',
  4: 'over 60 min',
};

export const dayDate = (day: number) => dateFromDay(day).toISOString().slice(0, 10);

/** Tag names for display: catalog names and `intent:<id>`; the star is reported separately. */
export const tagNames = (tags: readonly ResolvedTag[]) =>
  tags.flatMap((t) => (t.kind === 'tag' ? [t.tag.name] : t.kind === 'intent' ? [t.id] : []));

/** The metadata fields every call listing shares. None of them is transcript text. */
export function callSummary(row: {
  id: string;
  day: number;
  durationBucket: DurationBucket;
  meta: CallMeta;
  tags: readonly ResolvedTag[];
  starred: boolean;
}) {
  const { meta } = row;
  return {
    id: row.id,
    date: meta.startedAt ?? dayDate(row.day),
    duration:
      meta.durationSec !== null
        ? `${Math.round(meta.durationSec)} s`
        : DURATION_LABELS[row.durationBucket],
    direction: meta.direction,
    contact: meta.contactName,
    phone: meta.phoneE164,
    title: meta.title,
    tags: tagNames(row.tags),
    starred: row.starred,
  };
}

/** Transcript-derived text, always inside `<transcript>` delimiters (spec rule 2.6). */
export const untrusted = (text: string) => wrapTranscript(text.trim());
