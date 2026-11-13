import { CircleAlert, CircleCheck, Clock, Copy } from 'lucide-react';
import { Badge } from '../primitives/badge';
import { Progress } from '../primitives/progress';
import { Spinner } from '../primitives/spinner';

export type QueueState =
  | 'queued'
  | 'decoding'
  | 'transcribing'
  | 'translating'
  | 'indexing'
  | 'encrypting'
  | 'uploading'
  | 'done'
  | 'duplicate'
  | 'failed';

export type QueueItemStatusProps = {
  state: QueueState;
  /** The state's word, always visible: "Transcribing". */
  label: string;
  /** 0 to 100 while a step reports progress. */
  progress?: number;
  /** Failed: what went wrong, one line. */
  reason?: string;
};

const working = new Set<QueueState>([
  'decoding',
  'transcribing',
  'translating',
  'indexing',
  'encrypting',
  'uploading',
]);

/** The state of one file in an import, a job item that ends. Not a connection's health. */
export function QueueItemStatus({ state, label, progress, reason }: QueueItemStatusProps) {
  const busy = working.has(state);
  const variant =
    state === 'done' ? 'success' : state === 'failed' ? 'destructive' : busy ? 'accent' : 'neutral';
  return (
    <span
      data-component="QueueItemStatus"
      data-state={state}
      className="inline-flex flex-col gap-1.5"
    >
      <Badge variant={variant} className="self-start">
        {busy ? <Spinner /> : null}
        {state === 'queued' ? <Clock aria-hidden /> : null}
        {state === 'done' ? <CircleCheck aria-hidden /> : null}
        {state === 'duplicate' ? <Copy aria-hidden /> : null}
        {state === 'failed' ? <CircleAlert aria-hidden /> : null}
        {label}
        {busy && progress !== undefined ? (
          <span className="tabular">{` ${Math.round(progress)}%`}</span>
        ) : null}
      </Badge>
      {busy && progress !== undefined ? (
        <Progress value={progress} aria-hidden className="h-0.75 w-28" />
      ) : null}
      {state === 'failed' && reason ? (
        <span className="text-destructive text-xs">{reason}</span>
      ) : null}
    </span>
  );
}
