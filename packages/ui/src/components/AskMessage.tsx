import { MessageSquareText } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { formatClock } from '../lib/format';
import { type MdBlock, type MdInline, parseMarkdown, slot } from '../lib/markdown';
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
  const citation = (seconds: number, key: number) => (
    <TimestampLink
      key={key}
      context="citation"
      seconds={seconds}
      onSeek={(s) => onSeek?.(s)}
      a11yLabel={playFromLabel?.(formatClock(seconds)) ?? formatClock(seconds)}
      className="mx-0.5"
    />
  );
  if (kind === 'question') {
    return (
      <div
        data-component="AskMessage"
        data-role="question"
        dir="auto"
        className="max-w-4/5 self-end whitespace-pre-wrap rounded-lg rounded-ee-xs bg-muted px-3 py-2"
      >
        {parts.map((p, i) => (typeof p === 'string' ? p : citation(p.seconds, i)))}
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
      <div dir="auto" className="flex flex-col gap-2">
        <Markdown parts={parts} citation={citation} />
        {streaming ? (
          <span
            aria-hidden
            className="-mt-2 inline-block h-4 w-2 animate-pulse rounded-xs bg-primary motion-reduce:animate-none"
          />
        ) : null}
      </div>
    </div>
  );
}

function Markdown({
  parts,
  citation,
}: {
  parts: AskPart[];
  citation: (seconds: number, key: number) => ReactNode;
}) {
  const source = parts.map((p, i) => (typeof p === 'string' ? p : slot(i))).join('');
  const inline = (nodes: MdInline[]) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: a parsed tree, never reordered
    nodes.map((n, i) => <Fragment key={i}>{inlineNode(n)}</Fragment>);
  const blocks = (nodes: MdBlock[]) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: a parsed tree, never reordered
    nodes.map((b, i) => <Fragment key={i}>{blockNode(b)}</Fragment>);

  function inlineNode(n: MdInline): ReactNode {
    switch (n.type) {
      case 'text':
        return n.text;
      case 'break':
        return <br />;
      case 'code':
        return <code className="rounded-xs bg-muted px-1 font-mono text-[0.9em]">{n.text}</code>;
      case 'strong':
        return <strong className="font-semibold">{inline(n.children)}</strong>;
      case 'em':
        return <em>{inline(n.children)}</em>;
      case 'del':
        return <del>{inline(n.children)}</del>;
      case 'slot': {
        const p = parts[n.index];
        return p !== undefined && typeof p !== 'string' ? citation(p.seconds, n.index) : null;
      }
    }
  }

  function blockNode(b: MdBlock): ReactNode {
    switch (b.type) {
      case 'heading': {
        const Tag = `h${Math.min(b.level + 2, 6)}` as 'h3' | 'h4' | 'h5' | 'h6';
        return (
          <Tag dir="auto" className={b.level <= 2 ? 'font-semibold text-base' : 'font-semibold'}>
            {inline(b.children)}
          </Tag>
        );
      }
      case 'paragraph':
        return <p dir="auto">{inline(b.children)}</p>;
      case 'list': {
        const items = b.items.map((item, j) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a parsed tree, never reordered
          <li key={j} className="space-y-1 ps-1">
            {blocks(item)}
          </li>
        ));
        return b.ordered ? (
          <ol dir="auto" start={b.start} className="list-decimal space-y-1 ps-5">
            {items}
          </ol>
        ) : (
          <ul dir="auto" className="list-disc space-y-1 ps-5">
            {items}
          </ul>
        );
      }
      case 'quote':
        return (
          <blockquote className="flex flex-col gap-2 border-border border-s-2 ps-3 text-muted-foreground">
            {blocks(b.children)}
          </blockquote>
        );
      case 'code':
        return (
          <pre dir="ltr" className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-sm">
            <code>{b.text}</code>
          </pre>
        );
      case 'rule':
        return <hr className="border-border" />;
    }
  }

  return <>{blocks(parseMarkdown(source))}</>;
}
