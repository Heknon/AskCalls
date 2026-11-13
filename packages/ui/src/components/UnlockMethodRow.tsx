'use client';

import {
  FileKey,
  KeyRound,
  Laptop,
  RectangleEllipsis,
  Smartphone,
  Terminal,
  Unlink,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Badge } from '../primitives/badge';
import { Button } from '../primitives/button';
import { Tooltip } from '../primitives/tooltip';
import { ConfirmDialog } from './ConfirmDialog';

export type UnlockMethodRowProps = {
  /** One keyring entry that wraps the root key. */
  kind: 'passkey' | 'recovery' | 'passphrase' | 'device';
  /** For `device`: what it runs on. */
  deviceKind?: 'laptop' | 'phone' | 'agent';
  /** "MacBook Air · iCloud Keychain", "askcalls agent on studio-mac". */
  label: string;
  /** "Created 3 Oct 2026 · Last used today on macOS". */
  detail: string;
  /** This browser: shows `labels.thisDevice`. */
  current?: boolean;
  /**
   * The row's action. `remove` (passkeys, passphrase) and `revoke` (devices) ask first;
   * other verbs ("Regenerate", "Set passphrase") run directly.
   */
  action?: { kind: 'remove' | 'revoke' | 'other'; label: string; onAction: () => void };
  /** The last way to unlock can't be removed; the tooltip says why. */
  lastRemaining?: string;
  confirm?: { title: string; body: string; cancel: string };
  labels: { thisDevice: string };
};

const deviceIcons = { laptop: Laptop, phone: Smartphone, agent: Terminal };

function KindIcon({ kind, deviceKind }: Pick<UnlockMethodRowProps, 'kind' | 'deviceKind'>) {
  const Icon =
    kind === 'passkey'
      ? KeyRound
      : kind === 'recovery'
        ? FileKey
        : kind === 'passphrase'
          ? RectangleEllipsis
          : deviceIcons[deviceKind ?? 'laptop'];
  return <Icon className="size-4.5" aria-hidden />;
}

/** One way of unlocking: a passkey, the recovery code, the passphrase or a linked device. */
export function UnlockMethodRow({
  kind,
  deviceKind,
  label,
  detail,
  current = false,
  action,
  lastRemaining,
  confirm,
  labels,
}: UnlockMethodRowProps) {
  const [confirming, setConfirming] = useState(false);
  let button: ReactNode = null;
  if (action) {
    const asks = action.kind !== 'other' && confirm;
    const disabled = action.kind === 'remove' && !!lastRemaining;
    const btn = (
      <Button
        variant={action.kind === 'other' ? 'outline' : 'ghost'}
        size="sm"
        aria-label={`${action.label} ${label}`}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (disabled) return;
          if (asks) setConfirming(true);
          else action.onAction();
        }}
      >
        {action.kind === 'revoke' ? <Unlink className="size-4" aria-hidden /> : null}
        {action.label}
      </Button>
    );
    button = disabled ? <Tooltip content={lastRemaining}>{btn}</Tooltip> : btn;
  }
  return (
    <div
      data-component="UnlockMethodRow"
      data-kind={kind}
      className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 border-border border-b py-3 last:border-b-0 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto]"
    >
      <span className="flex size-9 items-center justify-center rounded-md bg-muted">
        <KindIcon kind={kind} deviceKind={deviceKind} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 font-semibold">
          <bdi dir="auto">{label}</bdi>
          {current ? <Badge variant="accent">{labels.thisDevice}</Badge> : null}
        </span>
        <span className="text-muted-foreground text-sm">{detail}</span>
      </div>
      {button ? <div className="col-start-2 sm:col-start-auto">{button}</div> : null}
      {action && confirm ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={confirm.title}
          description={confirm.body}
          confirmLabel={action.label}
          cancelLabel={confirm.cancel}
          onConfirm={action.onAction}
        />
      ) : null}
    </div>
  );
}
