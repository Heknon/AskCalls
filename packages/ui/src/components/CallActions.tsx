'use client';

import {
  ChevronDown,
  ChevronUp,
  Download,
  Ellipsis,
  MessageCircle,
  PhoneOutgoing,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '../primitives/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../primitives/dropdown-menu';
import { Tooltip } from '../primitives/tooltip';
import { ConfirmDialog } from './ConfirmDialog';
import { Kbd } from './Kbd';

export type CallActionsProps = {
  /** E.164. Missing or hidden: WhatsApp and Call back are disabled with a tooltip. */
  phone?: string;
  downloadFormats: { key: string; label: string }[];
  onDownload: (format: string) => void;
  onDelete: () => void;
  /** Hit navigation when opened from a search. */
  hits?: { index: number; count: number; onPrevious: () => void; onNext: () => void };
  /** Phones: the button that opens the Ask and Notes sheet. */
  askButton?: ReactNode;
  labels: {
    whatsapp: string;
    callBack: string;
    noNumber: string;
    download: string;
    more: string;
    delete: string;
    deleteTitle: string;
    deleteBody: string;
    cancel: string;
    hit: (index: number, count: number) => string;
    previousHit: string;
    nextHit: string;
  };
};

function NumberAction({
  href,
  icon,
  label,
  noNumber,
  external,
}: {
  href?: string;
  icon: ReactNode;
  label: string;
  noNumber: string;
  external?: boolean;
}) {
  if (!href) {
    return (
      <Tooltip content={noNumber}>
        <Button
          variant="outline"
          size="sm"
          aria-disabled="true"
          aria-label={label}
          onClick={(e) => e.preventDefault()}
        >
          {icon}
          <span className="max-md:hidden">{label}</span>
        </Button>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={label}>
      <Button variant="outline" size="sm" asChild>
        <a
          href={href}
          aria-label={label}
          target={external ? '_blank' : undefined}
          rel={external ? 'noopener noreferrer' : undefined}
        >
          {icon}
          <span className="max-md:hidden">{label}</span>
        </a>
      </Button>
    </Tooltip>
  );
}

/** The actions for one call: WhatsApp, call back, download, delete, and hit navigation. */
export function CallActions({
  phone,
  downloadFormats,
  onDownload,
  onDelete,
  hits,
  askButton,
  labels,
}: CallActionsProps) {
  const digits = phone?.replace(/[^\d]/g, '');
  const [confirming, setConfirming] = useState(false);
  return (
    <div data-component="CallActions" className="flex flex-wrap items-center gap-2">
      <NumberAction
        href={digits ? `https://wa.me/${digits}` : undefined}
        icon={<MessageCircle className="size-4" aria-hidden />}
        label={labels.whatsapp}
        noNumber={labels.noNumber}
        external
      />
      <NumberAction
        href={phone ? `tel:${phone}` : undefined}
        icon={<PhoneOutgoing className="size-4" aria-hidden />}
        label={labels.callBack}
        noNumber={labels.noNumber}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label={labels.download}>
            <Download className="size-4" aria-hidden />
            <span className="max-md:hidden">{labels.download}</span>
            <ChevronDown className="size-3.5 text-muted-foreground max-md:hidden" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {downloadFormats.map((f) => (
            <DropdownMenuItem key={f.key} onSelect={() => onDownload(f.key)}>
              {f.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={labels.more}>
            <Ellipsis className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2 aria-hidden />
            {labels.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={labels.deleteTitle}
        description={labels.deleteBody}
        confirmLabel={labels.delete}
        cancelLabel={labels.cancel}
        onConfirm={onDelete}
      />
      {hits ? (
        <div className="ms-auto flex items-center gap-1 text-muted-foreground text-sm">
          <span aria-live="polite" className="tabular me-1">
            {labels.hit(hits.index, hits.count)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={labels.previousHit}
            onClick={hits.onPrevious}
          >
            <ChevronUp className="size-4" aria-hidden />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={labels.nextHit} onClick={hits.onNext}>
            <ChevronDown className="size-4" aria-hidden />
          </Button>
          <Kbd className="max-md:hidden">n</Kbd>
        </div>
      ) : null}
      {askButton ? <span className="ms-auto md:hidden">{askButton}</span> : null}
    </div>
  );
}
