'use client';

import { Notice, type NoticeProps, NoticeRegion } from '@askcalls/ui/components/Notice';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

export type NoticeInput = Omit<NoticeProps, 'open' | 'onOpenChange'>;

type Notify = (notice: NoticeInput) => void;

const NoticesContext = createContext<Notify | null>(null);

/** 5 s, 8 s when the notice has an action (screens.md X2). */
const duration = (n: NoticeInput) => n.duration ?? (n.action ? 8_000 : 5_000);

/** The one toast region of the app; screens call `useNotify()` to show a `Notice`. */
export function NoticesProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  const [items, setItems] = useState<Array<NoticeInput & { id: number; open: boolean }>>([]);
  const notify = useCallback<Notify>((n) => {
    setItems((list) => [...list.slice(-2), { ...n, id: Date.now() + Math.random(), open: true }]);
  }, []);
  const close = (id: number) =>
    setItems((list) => list.map((n) => (n.id === id ? { ...n, open: false } : n)));
  const drop = (id: number) => setItems((list) => list.filter((n) => n.id !== id));
  const value = useMemo(() => notify, [notify]);
  return (
    <NoticesContext.Provider value={value}>
      <NoticeRegion label={t('notifications')}>
        {children}
        {items.map(({ id, open, ...n }) => (
          <Notice
            key={id}
            {...n}
            duration={duration(n)}
            open={open}
            onOpenChange={(o) => {
              if (o) return;
              close(id);
              setTimeout(() => drop(id), 300);
            }}
          />
        ))}
      </NoticeRegion>
    </NoticesContext.Provider>
  );
}

/** Shows a toast: `notify({ kind: 'event', title, icon })`. */
export function useNotify(): Notify {
  const notify = useContext(NoticesContext);
  if (!notify) throw new Error('useNotify needs NoticesProvider');
  return notify;
}
