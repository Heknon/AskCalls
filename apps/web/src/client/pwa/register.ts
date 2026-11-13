/** The app-shell service worker (public/sw.js), scoped to the whole origin. */
export const SERVICE_WORKER_URL = '/sw.js';

/**
 * Registers the service worker once the page has loaded. Call it from the app shell; failures
 * (unsupported browser, private mode) leave the app working without it.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' }).catch(() => undefined);
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
