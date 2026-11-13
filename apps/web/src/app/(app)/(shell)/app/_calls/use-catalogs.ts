'use client';

import type { ClientContext } from '@askcalls/client-core/context';
import { knownIntentIds } from '@askcalls/client-core/tags';
import type { Contact, Tag } from '@askcalls/client-core/userdata';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo } from 'react';
import { useAsync } from '../../_shell/states';

export interface Catalogs {
  tags: Tag[];
  contacts: Contact[];
  intents: { id: string; label: string }[];
  intentLabel: (id: string) => string;
  reload: () => void;
}

const BUILT_IN = new Set([
  'purchase_interest',
  'price_question',
  'complaint',
  'service_request',
  'scheduling',
  'legal',
  'follow_up',
]);

/** The decrypted tag, contact and intent catalogs that name filter values and chips. */
export function useCatalogs(ctx: ClientContext): Catalogs {
  const t = useTranslations('calls.intents');
  const state = useAsync(
    () =>
      Promise.all([
        ctx.userData.get('tags'),
        ctx.userData.get('contacts'),
        ctx.userData.get('settings'),
      ]),
    [ctx],
  );
  const [tags, contacts, settings] = state.data ?? [];
  const custom = settings?.customIntents;
  const intentLabel = useCallback(
    (id: string) =>
      BUILT_IN.has(id)
        ? t(id as Parameters<typeof t>[0])
        : (custom?.find((c) => c.id === id)?.label ?? id),
    [t, custom],
  );
  const intents = useMemo(
    () =>
      knownIntentIds((custom ?? []).map((c) => c.id)).map((id) => ({ id, label: intentLabel(id) })),
    [custom, intentLabel],
  );
  return {
    tags: tags?.tags ?? [],
    contacts: contacts?.contacts ?? [],
    intents,
    intentLabel,
    reload: state.reload,
  };
}
