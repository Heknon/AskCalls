import type { InstanceConfig } from '../config/schema';

/** Set by apps/web/local-server.mjs; a store exists only for requests that passed its guard. */
const GUARD = Symbol.for('askcalls.local.guard');

interface GuardStorage {
  getStore(): { loopback: true } | undefined;
}

/**
 * Local mode serves only requests that came through the loopback guard of `askcalls local`
 * (its socket's remote address was loopback and the Host header named this server). Started any
 * other way, a local-mode instance refuses every request. Server mode is unaffected.
 */
export function localRequestAllowed(config: Pick<InstanceConfig, 'appMode'>): boolean {
  if (config.appMode !== 'local') return true;
  const storage = (globalThis as { [GUARD]?: GuardStorage })[GUARD];
  return storage?.getStore()?.loopback === true;
}
