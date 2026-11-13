'use client';

import { MessageSquareText, SendHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert } from '../primitives/alert';
import { Button } from '../primitives/button';
import { AskMessage, type AskMessageProps } from './AskMessage';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

export type AskPanelProps = {
  /** False when Ask is turned off for this instance or user. */
  enabled: boolean;
  messages: (Omit<AskMessageProps, 'onSeek' | 'playFromLabel'> & { id: string })[];
  onSeek: (seconds: number) => void;
  /** Suggested questions ("Summarize this call"); tapping one asks it. */
  suggestions?: string[];
  value: string;
  onChange: (value: string) => void;
  onSend: (question: string) => void;
  /**
   * `sending`: the question is on its way. `error`: the provider didn't answer.
   * `quota`: today's questions are used up.
   */
  state?: 'idle' | 'sending' | 'error' | 'quota';
  /** The compact `DataFlowNote` naming model and route, under the input. */
  dataFlow: ReactNode;
  /** The `ConsentSheet`, opened by the screen before the first question. */
  consent?: ReactNode;
  labels: {
    placeholder: string;
    send: string;
    playFrom: (clock: string) => string;
    error: string;
    quota: string;
    off: string;
    retry: string;
  };
  onRetry?: () => void;
  /** Feature off: the way to change it, for users who can ("Settings → Providers"). */
  offAction?: ReactNode;
};

/** Ask the LLM about this one call. Answers stream into a polite live region. */
export function AskPanel({
  enabled,
  messages,
  onSeek,
  suggestions = [],
  value,
  onChange,
  onSend,
  state = 'idle',
  dataFlow,
  consent,
  labels,
  onRetry,
  offAction,
}: AskPanelProps) {
  if (!enabled) {
    return (
      <div data-component="AskPanel" data-state="off">
        <EmptyState
          reason="feature-off"
          icon={MessageSquareText}
          title={labels.off}
          action={offAction}
        />
      </div>
    );
  }
  const streaming = messages.some((m) => m.streaming);
  const canSend = value.trim() !== '' && state !== 'sending' && state !== 'quota' && !streaming;
  const send = () => {
    if (canSend) onSend(value.trim());
  };
  return (
    <div data-component="AskPanel" className="flex h-full min-h-0 flex-col">
      <div
        aria-live="polite"
        aria-busy={streaming || undefined}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
      >
        {messages.map(({ id, ...m }) => (
          <AskMessage key={id} {...m} onSeek={onSeek} playFromLabel={labels.playFrom} />
        ))}
      </div>
      <div className="flex flex-col gap-2 border-border border-t px-4 pt-3 pb-4">
        {state === 'error' ? (
          <ErrorState
            scope="panel"
            title={labels.error}
            retry={onRetry ? { label: labels.retry, onRetry } : undefined}
          />
        ) : null}
        {state === 'quota' ? <Alert tone="warning">{labels.quota}</Alert> : null}
        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((q) => (
              <Button
                key={q}
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={state === 'quota'}
                onClick={() => onSend(q)}
              >
                {q}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2 rounded-lg border border-input bg-card py-1.5 ps-3 pe-1.5 focus-within:border-ring focus-within:outline-2 focus-within:outline-ring focus-within:outline-offset-1">
          <textarea
            dir="auto"
            rows={2}
            value={value}
            aria-label={labels.placeholder}
            placeholder={labels.placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none bg-transparent pt-1 text-md leading-5.5 outline-none placeholder:text-subtle-foreground focus-visible:outline-none md:text-base"
          />
          <Button
            variant="primary"
            size="icon-sm"
            aria-label={labels.send}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            loading={state === 'sending'}
            disabled={!canSend}
            onClick={send}
          >
            {state === 'sending' ? null : (
              <SendHorizontal className="icon-directional size-4" aria-hidden />
            )}
          </Button>
        </div>
        {dataFlow}
      </div>
      {consent}
    </div>
  );
}
