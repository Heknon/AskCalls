import { expect, type Page, test } from '@playwright/test';

const PAGES = [
  ['/', 'Ask your calls anything.', 'לשאול את השיחות שלך כל דבר.'],
  ['/pricing', 'Free during beta.', 'חינם בתקופת הבטא.'],
  ['/security', "We can't read your calls.", 'אנחנו לא יכולים לקרוא את השיחות שלך.'],
  ['/faq', 'Questions.', 'שאלות.'],
  ['/mcp', 'Connect your AI.', 'חיבור ל-AI.'],
  ['/self-host', 'Self-host.', 'אירוח עצמי.'],
  ['/privacy', 'Privacy policy.', 'מדיניות פרטיות.'],
  ['/terms', 'Terms.', 'תנאי שימוש.'],
  ['/dpa', 'Data processing agreement.', 'הסכם עיבוד נתונים.'],
  ['/subprocessors', 'Subprocessors.', 'ספקי משנה.'],
] as const;

const LEGAL = ['/privacy', '/terms', '/dpa', '/subprocessors'];

const h1 = (page: Page) => page.getByRole('heading', { level: 1 });
const squash = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim();

for (const [path, en, he] of PAGES) {
  test(`${path} renders in English and in Hebrew`, async ({ page, context, baseURL }) => {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    expect(squash(await h1(page).textContent())).toBe(en);
    if (LEGAL.includes(path))
      await expect(page.getByText('Draft — to be reviewed by counsel')).toBeVisible();

    await context.addCookies([{ name: 'locale', value: 'he', url: baseURL! }]);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    expect(squash(await h1(page).textContent())).toBe(he);
  });
}

test('search engines without a language preference get English and a canonical URL', async ({
  request,
}) => {
  const res = await request.get('/pricing', { headers: { 'accept-language': '' } });
  const html = await res.text();
  expect(html).toContain('<html lang="en" dir="ltr"');
  expect(html).toMatch(/<link rel="canonical" href="[^"]+\/pricing"/);
  expect(html).toContain('property="og:image"');
  expect(res.headers()['cache-control']).toContain('no-store');
});

test('a shared app link previews with the share card', async ({ request }) => {
  for (const path of ['/login', '/app/upload']) {
    const html = await (await request.get(path)).text();
    expect(html).toMatch(/<meta property="og:image" content="https?:\/\/[^"]+\/og-image"/);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
  }
  const image = await request.get('/og-image');
  expect(image.headers()['content-type']).toBe('image/png');
});

test('the language button switches the page to Hebrew and back, and it sticks', async ({
  page,
}) => {
  await page.goto('/pricing');
  await page.getByRole('button', { name: 'עברית' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page).toHaveURL(/\/pricing$/);
  await page.reload();
  expect(squash(await h1(page).textContent())).toBe('חינם בתקופת הבטא.');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('the hero demo plays to its end state and pauses', async ({ page }) => {
  await page.goto('/');
  const demo = page.locator('[data-component="DemoFrame"]');
  await expect(demo).toHaveAttribute('data-phase', 'typing');
  await expect(demo).toHaveAttribute('data-phase', 'hold', { timeout: 15_000 });
  await expect(demo.locator('.r.done')).toHaveCount(3);
  await expect(demo.locator('.qtext')).toHaveText('people interested in buying');
  await expect(demo.locator('mark').first()).toHaveText(
    'If the oak one is still available, I’d like to reserve it',
  );
  const pause = page.getByRole('button', { name: 'Pause' });
  await pause.click();
  await expect(demo).toHaveAttribute('data-phase', 'paused');
  await expect(page.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true');
});

test('under reduced motion the hero shows its end state, still, with no pause control', async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  const demo = page.locator('[data-component="DemoFrame"]');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await expect(demo).toHaveAttribute('data-phase', 'static');
  await expect(demo.locator('.r.done')).toHaveCount(3);
  await expect(demo.locator('.r.go')).toHaveCount(0);
  await expect(demo.locator('.qtext')).toHaveText('people interested in buying');
  await expect(page.locator('.pause')).toBeHidden();
  await context.close();
});

test('every internal nav and footer link resolves', async ({ page, request }) => {
  const hrefs = new Set<string>();
  for (const [path] of PAGES) {
    await page.goto(path);
    for (const href of await page
      .locator('header a[href^="/"], footer a[href^="/"], main a[href^="/"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href')!))) {
      hrefs.add(href.split('#')[0]!);
    }
  }
  for (const l of ['/terms', '/privacy', '/dpa', '/subprocessors', '/mcp', '/self-host'])
    expect(hrefs).toContain(l);
  for (const href of hrefs) {
    const res = await request.get(href);
    expect(res.status(), href).toBeLessThan(400);
  }
});

test('marketing pages carry a nonce CSP without unsafe-inline, and Google only on /', async ({
  request,
}) => {
  for (const [path] of PAGES) {
    const res = await request.get(path);
    const csp = res.headers()['content-security-policy'] ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce, path).toBeTruthy();
    expect(csp, path).not.toContain('unsafe-inline');
    const html = await res.text();
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]!);
    for (const attrs of scripts) expect(attrs, path).toContain(`nonce="${nonce}"`);
    if (path !== '/') expect(csp, path).not.toContain('accounts.google.com');
  }
});

test('/ makes no third-party requests when One Tap is not configured', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const foreign: string[] = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith('http') && u.origin !== origin) foreign.push(r.url());
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.mouse.wheel(0, 6000);
  await page.waitForTimeout(500);
  expect(foreign).toEqual([]);
});

test('the marketing pages load no script but the framework and the hero demo', async ({ page }) => {
  const scripts: string[] = [];
  page.on('response', (r) => {
    if (r.request().resourceType() === 'script') scripts.push(new URL(r.url()).pathname);
  });
  await page.goto('/pricing');
  await page.waitForLoadState('networkidle');
  expect(scripts.every((s) => s.startsWith('/_next/static/'))).toBe(true);
  expect(await page.locator('[data-component="DemoFrame"]').count()).toBe(0);
});

test('sitemap, robots and the web app manifest', async ({ request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const [path] of PAGES) expect(sitemap).toContain(`${path === '/' ? '' : path}</loc>`);
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /app');
  expect(robots).toContain('Sitemap:');
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.start_url).toBe('/app');
  for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
});
