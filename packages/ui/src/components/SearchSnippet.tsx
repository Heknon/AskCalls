import { cn } from '../lib/cn';
import { splitHits } from '../lib/match';
import { HitMark } from './HitMark';

export type SearchSnippetProps = {
  /** The best passage, decrypted on the device. A leading "…" belongs inside the text. */
  text: string;
  hits: readonly string[];
  lines?: 1 | 2 | 3;
  /** The passage's language when it came from a translation: a short code and its meaning. */
  marker?: { label: string; title: string };
  className?: string;
};

const clamp = { 1: 'line-clamp-1', 2: 'line-clamp-2', 3: 'line-clamp-3' };

/** The best-matching passage of a call with its hits marked, aligned to the UI direction. */
export function SearchSnippet({ text, hits, lines = 2, marker, className }: SearchSnippetProps) {
  return (
    <p
      data-component="SearchSnippet"
      dir="auto"
      className={cn('text-ui-start leading-5.5', clamp[lines], className)}
    >
      {marker ? (
        <abbr
          data-slot="language"
          title={marker.title}
          className="me-1.5 inline-flex h-4.5 items-center rounded-sm border border-border px-1 align-[0.1em] font-medium text-[0.6875rem] text-muted-foreground uppercase no-underline"
        >
          {marker.label}
        </abbr>
      ) : null}
      {splitHits(text, hits).map((part, i) =>
        part.hit ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of one string, never reordered
          <HitMark key={i}>{part.text}</HitMark>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}
