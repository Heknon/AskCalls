import { MessageSquareText } from 'lucide-react';
import { formatClock } from '../lib/format';
import { TimestampLink } from './TimestampLink';

export type AskPart = string | { seconds: number };

export type AskMessageProps = {
  kind: 'question' | 'answer';
  /** Text with citations: `["Dana asked for a quote ", { seconds: 48 }, " and …"]`. */
  parts: AskPart[];
  /** Answers: the model that wrote it ("Claude Sonnet"). */
  author?: string;
  /** The answer is still arriving. */
  streaming?: boolean;
  onSeek?: (seconds: number) => void;
  /** "Play from 0:48". */
  playFromLabel?: (clock: string) => string;
};

/** One question or answer in the ask conversation. */
export function AskMessage({
  kind,
  parts,
  author,
  streaming = false,
  onSeek,
  playFromLabel,
}: AskMessageProps) {
  const body = parts.map((p, i) =>
    typeof p === 'string' ? (
      p
    ) : (
      <TimestampLink
        // biome-ignore lint/suspicious/noArrayIndexKey: parts of one message, never reordered
        key={i}
        context="citation"
        seconds={p.seconds}
        onSeek={(s) => onSeek?.(s)}
        a11yLabel={playFromLabel?.(formatClock(p.seconds)) ?? formatClock(p.seconds)}
        className="mx-0.5"
      />
    ),
  );
  if (kind === 'question') {
    return (
      <div
        data-component="AskMessage"
        data-role="question"
        dir="auto"
        className="max-w-4/5 self-end rounded-lg rounded-ee-xs bg-muted px-3 py-2"
      >
        {body}
      </div>
    );
  }
  return (
    <div
      data-component="AskMessage"
      data-role="answer"
      aria-busy={streaming || undefined}
      className="flex flex-col gap-2 leading-6"
    >
      {author ? (
        <span className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
          <MessageSquareText className="size-3.5" aria-hidden />
          {author}
        </span>
      ) : null}
      <p dir="auto">
        {body}
        {streaming ? (
          <span
            aria-hidden
            className="ms-0.5 inline-block h-4 w-2 animate-pulse rounded-xs bg-primary align-text-bottom motion-reduce:animate-none"
          />
        ) : null}
      </p>
    </div>
  );
}
