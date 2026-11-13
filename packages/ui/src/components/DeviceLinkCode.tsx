'use client';

import { Copy, Laptop, Smartphone, Terminal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../primitives/button';

export type DeviceLinkCodeProps = {
  /** `connected` moves the dialog on to the fingerprint step. */
  state: 'waiting' | 'connected' | 'expired';
  /** QR modules, rendered locally as SVG (row-major, true = dark). */
  qr: boolean[][];
  /** The short code for typing on the new device, e.g. "KQ7-4MX". */
  shortCode: string;
  /** "9:12 left". */
  expiresIn: string;
  /** Connected: which device ("askcalls agent, macOS") and its kind. */
  device?: { label: ReactNode; kind: 'laptop' | 'phone' | 'agent' };
  onCopy: () => void;
  onRenew: () => void;
  labels: {
    /** "Scan with the new device, or type this code". */
    scan: string;
    qr: string;
    copy: string;
    /** "A new device connected:" */
    connected: string;
    expired: string;
    renew: string;
  };
};

const deviceIcons = { laptop: Laptop, phone: Smartphone, agent: Terminal };

function QrSvg({ modules, label }: { modules: boolean[][]; label: string }) {
  const n = modules.length;
  const quiet = 2;
  const size = n + quiet * 2;
  let d = '';
  modules.forEach((row, y) => {
    row.forEach((on, x) => {
      if (on) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    });
  });
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="size-40 rounded-md bg-white"
    >
      <path d={d} fill="#000" />
    </svg>
  );
}

/** The QR code and short code a new device uses to join, with its expiry. */
export function DeviceLinkCode({
  state,
  qr,
  shortCode,
  expiresIn,
  device,
  onCopy,
  onRenew,
  labels,
}: DeviceLinkCodeProps) {
  if (state === 'connected' && device) {
    const Icon = deviceIcons[device.kind];
    return (
      <div
        data-component="DeviceLinkCode"
        data-state="connected"
        role="status"
        className="flex items-center gap-2.5 rounded-md bg-muted p-3 text-sm"
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">
          {labels.connected} {device.label}
        </span>
        <span className="tabular text-muted-foreground">{expiresIn}</span>
      </div>
    );
  }
  if (state === 'expired') {
    return (
      <div
        data-component="DeviceLinkCode"
        data-state="expired"
        className="flex flex-col items-center gap-3 rounded-lg border border-border bg-background p-6 text-center"
      >
        <p className="text-muted-foreground">{labels.expired}</p>
        <Button variant="primary" onClick={onRenew}>
          {labels.renew}
        </Button>
      </div>
    );
  }
  return (
    <div
      data-component="DeviceLinkCode"
      data-state="waiting"
      className="flex flex-col items-center gap-3 rounded-lg border border-border bg-background p-6 text-center"
    >
      <QrSvg modules={qr} label={labels.qr} />
      <p className="text-muted-foreground text-sm">{labels.scan}</p>
      <div className="flex items-center gap-2">
        <bdi dir="ltr" className="ltr-island font-medium font-mono text-xl tracking-widest">
          {shortCode}
        </bdi>
        <Button variant="ghost" size="icon-sm" aria-label={labels.copy} onClick={onCopy}>
          <Copy className="size-4" aria-hidden />
        </Button>
      </div>
      <span className="tabular text-muted-foreground text-sm">{expiresIn}</span>
    </div>
  );
}
