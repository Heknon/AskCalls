'use client';

import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge } from '../primitives/badge';
import { Tooltip } from '../primitives/tooltip';

export type SignatureStatus = 'verified' | 'unknown-device' | 'invalid' | 'missing';

export type SignatureBadgeProps = {
  status: SignatureStatus;
  /** Always visible: "Signed by MacBook Air", "Signature doesn't match". */
  label: string;
  /** Tooltip explaining the check. */
  detail?: string;
};

const look = {
  verified: { variant: 'success', Icon: ShieldCheck },
  'unknown-device': { variant: 'warning', Icon: ShieldAlert },
  missing: { variant: 'warning', Icon: ShieldAlert },
  invalid: { variant: 'destructive', Icon: ShieldAlert },
} as const;

/** Whether one of your devices signed the transcript and the signature verified. Call header only. */
export function SignatureBadge({ status, label, detail }: SignatureBadgeProps) {
  const { variant, Icon } = look[status];
  const badge = (
    <Badge
      data-component="SignatureBadge"
      data-status={status}
      variant={variant}
      tabIndex={detail ? 0 : undefined}
    >
      <Icon aria-hidden />
      <bdi dir="auto">{label}</bdi>
    </Badge>
  );
  return detail ? <Tooltip content={detail}>{badge}</Tooltip> : badge;
}
