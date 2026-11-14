/** "Lock on reload", a choice of this browser (Settings → Security), off by default. */
const KEY = 'askcalls-lock-on-reload';

export function lockOnReload(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setLockOnReload(on: boolean): void {
  if (on) localStorage.setItem(KEY, '1');
  else localStorage.removeItem(KEY);
}
