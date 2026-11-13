'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../primitives/button';

export type CopyableCodeProps = {
  code: string;
  /** "shell", "json": for the label and future highlighting. */
  language: string;
  labels: { copy: string; copied: string };
  onCopy?: () => void;
};

/** A command or config snippet to copy. Always LTR. */
export function CopyableCode({ code, language, labels, onCopy }: CopyableCodeProps) {
  const [copied, setCopied] = useState(false);
  return (
    <div
      data-component="CopyableCode"
      data-language={language}
      dir="ltr"
      className="relative min-w-0 max-w-full rounded-md border border-border bg-muted"
    >
      <pre className="m-0 overflow-x-auto py-3 ps-3.5 pe-12 text-left font-mono text-sm leading-5.5">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={copied ? labels.copied : labels.copy}
        className="absolute end-1.5 top-1.5"
        onClick={() => {
          void navigator.clipboard?.writeText(code);
          setCopied(true);
          onCopy?.();
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
      </Button>
    </div>
  );
}
