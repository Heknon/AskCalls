'use client';

import type { IngestMeta } from '@askcalls/client-core/ingest';
import { DEFAULT_PHONE_REGION, isPhoneRegion, parsePhone } from '@askcalls/indexing';
import { Button } from '@askcalls/ui/primitives/button';
import { TableHead } from '@askcalls/ui/primitives/table';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/** Rows shown at a time in the queue and review tables. */
export const PAGE = 100;

export function contactOf(meta: IngestMeta | undefined, region: string) {
  const phone = meta?.phone
    ? parsePhone(meta.phone, isPhoneRegion(region) ? region : DEFAULT_PHONE_REGION)
    : null;
  if (!meta?.contactName && !phone) return undefined;
  return { ...(meta?.contactName && { name: meta.contactName }), ...(phone && { phone }) };
}

export function parts(
  i: { audio: unknown; transcript: unknown },
  t: ReturnType<typeof useTranslations<'upload'>>,
) {
  return [i.audio ? t('parts.audio') : null, i.transcript ? t('parts.transcript') : null].filter(
    (p): p is string => p !== null,
  );
}

/** `groups`: the children are `ImportGroup` bodies, not rows. */
export function QueueTable({
  children,
  groups = false,
}: {
  children: ReactNode;
  groups?: boolean;
}) {
  const t = useTranslations('upload.bulk.col');
  const tb = useTranslations('upload.bulk');
  return (
    <table className="w-full border-collapse">
      <thead className="max-md:hidden">
        <tr>
          <TableHead>{t('file')}</TableHead>
          <TableHead>{t('contact')}</TableHead>
          <TableHead>{t('status')}</TableHead>
          <TableHead>
            <span className="sr-only">{tb('retry')}</span>
          </TableHead>
        </tr>
      </thead>
      {groups ? children : <tbody>{children}</tbody>}
    </table>
  );
}

export function ShowMore({
  total,
  shown,
  onMore,
}: {
  total: number;
  shown: number;
  onMore: () => void;
}) {
  const t = useTranslations('upload.bulk');
  if (total <= shown) return null;
  return (
    <div className="flex justify-center p-3">
      <Button variant="ghost" onClick={onMore}>
        {t('showMore', { n: Math.min(PAGE, total - shown) })}
      </Button>
    </div>
  );
}
