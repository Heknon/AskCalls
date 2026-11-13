import { hostOf, isLocalHost } from '../config/offline';

/** Thrown when offline mode stops a request to a host outside the local network. */
export class OfflineBlockedError extends Error {
  constructor(readonly host: string) {
    super(`Offline mode blocks requests to ${host}`);
    this.name = 'OfflineBlockedError';
  }
}

function targetUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * The fetch every HTTP adapter receives from the composition root. With offline mode on it
 * refuses any request whose host is outside the local network before a socket opens; with it
 * off it is plain fetch.
 */
export function guardedFetch(offline: boolean, base: typeof fetch = fetch): typeof fetch {
  if (!offline) return (input, init) => base(input, init);
  return async (input, init) => {
    const host = hostOf(targetUrl(input));
    if (!host || !isLocalHost(host)) throw new OfflineBlockedError(host ?? 'an unknown host');
    return base(input, init);
  };
}

/** For adapters that open their own connections (Postgres, S3, SMTP): the same rule, at build. */
export function assertLocalTarget(offline: boolean, url: string | undefined): void {
  if (!offline || !url) return;
  const host = hostOf(url);
  if (!host || !isLocalHost(host)) throw new OfflineBlockedError(host ?? 'an unknown host');
}
