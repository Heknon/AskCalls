'use client';

import { Key, Unlink } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '../primitives/badge';
import { Button } from '../primitives/button';
import { ConfirmDialog } from './ConfirmDialog';

export type TokenRowProps = {
  name: string;
  /** "calls:read", "inbox:write". */
  scopes: string[];
  /** "Expires 12 Feb 2027 · Last used yesterday". */
  detail: string;
  /** Expired tokens show a warning badge and can only be removed. */
  expired?: string;
  onRevoke: () => void;
  labels: { revoke: string; revokeTitle: string; revokeBody: string; cancel: string };
};

/** One personal access token with scopes, expiry and use. */
export function TokenRow({ name, scopes, detail, expired, onRevoke, labels }: TokenRowProps) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div
      data-component="TokenRow"
      className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 border-border border-b py-3 last:border-b-0 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto]"
    >
      <span className="flex size-9 items-center justify-center rounded-md bg-muted">
        <Key className="size-4.5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          <bdi dir="auto">{name}</bdi>
          {expired ? <Badge variant="warning">{expired}</Badge> : null}
        </span>
        <span className="flex flex-wrap gap-1">
          {scopes.map((s) => (
            <Badge key={s} variant="outline" className="rounded-xs font-mono">
              {s}
            </Badge>
          ))}
        </span>
        <span className="text-muted-foreground text-sm">{detail}</span>
      </div>
      <div className="col-start-2 sm:col-start-auto">
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${labels.revoke} ${name}`}
          onClick={() => setConfirming(true)}
        >
          <Unlink className="size-4" aria-hidden />
          {labels.revoke}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={labels.revokeTitle}
        description={labels.revokeBody}
        confirmLabel={labels.revoke}
        cancelLabel={labels.cancel}
        onConfirm={onRevoke}
      />
    </div>
  );
}
