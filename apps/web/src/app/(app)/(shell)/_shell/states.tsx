'use client';

import { EmptyState, type EmptyStateProps } from '@askcalls/ui/components/EmptyState';
import { ErrorState } from '@askcalls/ui/components/ErrorState';
import { Skeleton } from '@askcalls/ui/primitives/skeleton';
import { useTranslations } from 'next-intl';
import {
  type DependencyList,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLockWipe } from '../../../../client/session/session';

export type Async<T> =
  | { status: 'loading'; data: undefined; reload: () => void }
  | { status: 'error'; data: undefined; error: unknown; reload: () => void }
  | { status: 'ready'; data: T; reload: () => void };

/**
 * Loads data for a screen and tracks loading, error and ready. Re-runs when `deps` change and
 * on `reload()`; a late result after unmount, a newer load or a lock is dropped, and the data
 * is cleared when the session locks.
 */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): Async<T> {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; error: unknown } | { status: 'ready'; data: T }
  >({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const run = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useLockWipe(() => {
    run.current++;
    setState({ status: 'loading' });
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: the caller's deps drive reloads
  useEffect(() => {
    const id = ++run.current;
    setState({ status: 'loading' });
    loadRef.current().then(
      (data) => id === run.current && setState({ status: 'ready', data }),
      (error: unknown) => id === run.current && setState({ status: 'error', error }),
    );
  }, [...deps, attempt]);
  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  if (state.status === 'ready') return { status: 'ready', data: state.data, reload };
  if (state.status === 'error')
    return { status: 'error', data: undefined, error: state.error, reload };
  return { status: 'loading', data: undefined, reload };
}

/** Shows skeletons only after 150 ms, then for at least 300 ms (design-system.md 10). */
export function useSkeletonDelay(loading: boolean): boolean {
  const [shown, setShown] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    if (loading) {
      const t = setTimeout(() => {
        since.current = Date.now();
        setShown(true);
      }, 150);
      return () => clearTimeout(t);
    }
    if (!shown) return;
    const left = 300 - (Date.now() - since.current);
    const t = setTimeout(() => setShown(false), Math.max(0, left));
    return () => clearTimeout(t);
  }, [loading, shown]);
  return shown;
}

/** Network-wait lines at text size for a panel; lists pass their own row placeholders. */
export function PanelSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden className="flex flex-col gap-2.5 py-2">
      {Array.from({ length: lines }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders
        <Skeleton key={i} className={i === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}

export type AsyncViewProps<T> = {
  state: Async<T>;
  /** While loading (after 150 ms): `PanelSkeleton`, or rows of `DecryptingPlaceholder`. */
  loading?: ReactNode;
  /** When the data is empty: an `EmptyState`. */
  empty?: Omit<EmptyStateProps, 'className'>;
  isEmpty?: (data: T) => boolean;
  /** The panel error's lines; defaults to "Couldn't load this section" / "Try again". */
  error?: { title: string; description?: string };
  children: (data: T) => ReactNode;
};

/** The loading, empty, error and ready states of one async surface, in one place. */
export function AsyncView<T>({
  state,
  loading,
  empty,
  isEmpty,
  error,
  children,
}: AsyncViewProps<T>) {
  const t = useTranslations('common');
  const showSkeleton = useSkeletonDelay(state.status === 'loading');
  if (state.status === 'loading') {
    return <div aria-busy="true">{showSkeleton ? (loading ?? <PanelSkeleton />) : null}</div>;
  }
  if (state.status === 'error') {
    return (
      <ErrorState
        scope="panel"
        title={error?.title ?? t('error.panel')}
        description={error?.description ?? t('error.body')}
        retry={{ label: t('retry'), onRetry: state.reload }}
      />
    );
  }
  if (empty && isEmpty?.(state.data)) return <EmptyState {...empty} />;
  return <>{children(state.data)}</>;
}
