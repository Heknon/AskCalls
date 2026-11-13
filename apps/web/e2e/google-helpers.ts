import type { BrowserContext } from '@playwright/test';

/** The fake Google (e2e/fake-google-server.ts) behind the Google Drive spec. */
export const GOOGLE_PORT = Number(
  process.env.E2E_GOOGLE_PORT ?? Number(process.env.E2E_PORT ?? 3417) + 2,
);
export const GOOGLE_URL = `http://127.0.0.1:${GOOGLE_PORT}`;

/**
 * Sends the browser's requests to Google (consent page, Drive API) to the fake. Chromium doesn't
 * route a request a redirect started, so the connect step's redirect to Google's consent page is
 * followed here: the fake consents and the popup goes on to our callback.
 */
export async function routeGoogle(context: BrowserContext, seen: string[], origin: string) {
  await context.route(`${origin}/api/storage/connect/google?*`, async (route) => {
    const ours = await route.fetch({ maxRedirects: 0 });
    const consent = new URL(ours.headers().location ?? '');
    seen.push(`GET ${consent.host}${consent.pathname}`);
    const cookie = ours.headers()['set-cookie']?.split(';')[0] ?? '';
    const eq = cookie.indexOf('=');
    await context.addCookies([
      {
        name: cookie.slice(0, eq),
        value: cookie.slice(eq + 1),
        url: `${origin}/api/storage/callback/google`,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    const granted = await fetch(`${GOOGLE_URL}${consent.pathname}${consent.search}`, {
      redirect: 'manual',
    });
    await route.fulfill({
      status: 302,
      headers: { location: granted.headers.get('location') ?? '/' },
    });
  });
  for (const host of ['https://accounts.google.com', 'https://www.googleapis.com']) {
    await context.route(`${host}/**`, async (route) => {
      const u = new URL(route.request().url());
      seen.push(`${route.request().method()} ${u.host}${u.pathname}`);
      const response = await route.fetch({
        url: `${GOOGLE_URL}${u.pathname}${u.search}`,
        maxRedirects: 0,
      });
      await route.fulfill({ response });
    });
  }
}

export interface DriveState {
  files: Array<{ id: string; name: string; bytes: number }>;
  revoked: number;
}

export async function driveState(): Promise<DriveState> {
  return (await fetch(`${GOOGLE_URL}/state`)).json() as Promise<DriveState>;
}
