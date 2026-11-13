'use client';

import { type DecryptedCall, deleteCall } from '@askcalls/client-core/calls';
import type { ClientContext } from '@askcalls/client-core/context';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useSyncExternalStore } from 'react';
import { useNotify } from '../../../../../client/notices/notices';
import { useAppSession } from '../../../../../client/session/session';

/** The Undo window: the delete request goes out when the toast closes. */
const UNDO_MS = 5_000;

const pending = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set();
const changed = () => {
  snapshot = new Set(pending.keys());
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Calls deleted but still inside their Undo window: lists hide them. */
export function usePendingDeletes(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

/**
 * Deletes a call with a 5 s Undo toast. `onUndo` runs after Undo (the call view reopens the
 * call). The vocabulary is corrected when the decrypted call is at hand.
 */
export function useDeleteCall(ctx: ClientContext) {
  const t = useTranslations('call.delete');
  const notify = useNotify();
  const { refreshMe } = useAppSession();
  return useCallback(
    (
      id: string,
      opts: { decrypted?: Pick<DecryptedCall, 'transcript' | 'meta'>; onUndo?: () => void } = {},
    ) => {
      const send = () => {
        pending.delete(id);
        deleteCall(ctx, id, opts.decrypted)
          .catch(() => deleteCall(ctx, id))
          .then(
            () => refreshMe().catch(() => {}),
            () => {
              changed();
              notify({ kind: 'error', title: t('failed') });
            },
          );
        changed();
      };
      pending.set(id, setTimeout(send, UNDO_MS));
      changed();
      notify({
        kind: 'undo',
        icon: Trash2,
        title: t('done'),
        duration: UNDO_MS,
        action: {
          label: t('undo'),
          altText: t('undoAlt'),
          onAction: () => {
            const timer = pending.get(id);
            if (timer === undefined) return;
            clearTimeout(timer);
            pending.delete(id);
            changed();
            opts.onUndo?.();
          },
        },
      });
    },
    [ctx, notify, refreshMe, t],
  );
}
