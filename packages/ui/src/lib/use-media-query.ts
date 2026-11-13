import { useSyncExternalStore } from 'react';

/** Phones: below the `md` breakpoint (768 px), where pickers and panels become bottom sheets. */
export const PHONE_QUERY = '(max-width: 47.9375rem)';

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useIsPhone() {
  return useMediaQuery(PHONE_QUERY);
}
