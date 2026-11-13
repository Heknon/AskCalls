import { firstStrongDir } from '../lib/bidi';
import { cn } from '../lib/cn';
import { splitHits } from '../lib/match';
import { HitMark } from './HitMark';
import { TimestampLink } from './TimestampLink';

export type TranscriptSegmentProps = {
  /** "You", the contact's name, or "Speaker 1". */
  speaker: string;
  /** The user's own turns: the speaker name is quieter. */
  isYou?: boolean;
  start: number;
  text: string;
  hits?: readonly string[];
  playing?: boolean;
  /** Same speaker as the turn before: the speaker line is left out. */
  groupedWithPrevious?: boolean;
  onSeek: (seconds: number) => void;
  /** "Play from 0:48". */
  playFromLabel: string;
  noRecordingHint?: string;
};

/**
 * One speaker turn. The turn takes its direction from its own text, so a Hebrew turn and its
 * speaker line align right even in the English UI.
 */
export function TranscriptSegment({
  speaker,
  isYou = false,
  start,
  text,
  hits = [],
  playing = false,
  groupedWithPrevious = false,
  onSeek,
  playFromLabel,
  noRecordingHint,
}: TranscriptSegmentProps) {
  return (
    <li
      data-component="TranscriptSegment"
      data-playing={playing || undefined}
      dir={firstStrongDir(text)}
      aria-current={playing ? 'true' : undefined}
      className={cn(
        'relative flex flex-col gap-0.5 rounded-md px-3.5 py-2.5 text-start',
        groupedWithPrevious && 'pt-0',
        playing &&
          'bg-primary-subtle before:absolute before:inset-y-2 before:start-0 before:w-0.75 before:rounded-full before:bg-primary',
      )}
    >
      {groupedWithPrevious ? null : (
        <div className="flex items-baseline gap-2">
          <span
            dir="auto"
            className={cn('font-semibold text-sm', isYou && 'text-muted-foreground')}
          >
            {speaker}
          </span>
          <TimestampLink
            seconds={start}
            onSeek={onSeek}
            a11yLabel={playFromLabel}
            noRecordingHint={noRecordingHint}
          />
        </div>
      )}
      <p className="text-md leading-7">
        {splitHits(text, hits).map((part, i) =>
          part.hit ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of one string, never reordered
            <HitMark key={i}>{part.text}</HitMark>
          ) : (
            part.text
          ),
        )}
      </p>
    </li>
  );
}
