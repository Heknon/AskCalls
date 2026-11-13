/**
 * Accessibility smoke test: runs axe-core (WCAG 2.2 A/AA rules) over every page of the component
 * gallery at /dev/components, in both themes and both directions, plus the opened overlays
 * (search suggestions, a filter picker, the consent sheet, a confirm dialog, the shortcuts dialog).
 *
 *   bun run --cwd apps/web dev            # the gallery only exists outside production
 *   node packages/ui/scripts/gallery-a11y.mjs http://localhost:3000
 *
 * Uses the Chromium that ships with @playwright/test (no `playwright install`).
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../../../apps/web/package.json', import.meta.url));
const require = createRequire(web);
const { chromium } = require(
  require.resolve('playwright', { paths: [require.resolve('@playwright/test')] }),
);
const axePath = require.resolve('axe-core/axe.min.js');

const base = process.argv[2] ?? 'http://localhost:3000';
const groups = [
  'frame',
  'list',
  'search',
  'call',
  'trust',
  'upload',
  'organise',
  'settings',
  'feedback',
  'marketing',
  'primitives',
];
const variants = [
  ['light', 'en'],
  ['dark', 'en'],
  ['light', 'he'],
  ['dark', 'he'],
];
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Opens an overlay on a page so axe sees it too. */
const overlays = {
  search: async (page) => {
    await page.locator('#searchbox-demo input').first().click();
    await page.keyboard.press('ArrowDown');
  },
  'search-picker': async (page) => {
    await page.locator('#searchbox-demo [data-facet="tag"]').first().click();
  },
  'call-consent': async (page) => page.locator('#open-consent').click(),
  'feedback-confirm': async (page) => page.locator('#open-confirm').click(),
  'frame-shortcuts': async (page) =>
    page
      .getByRole('button', { name: /shortcuts|הקיצורים/i })
      .last()
      .click(),
};

const write = (line) => process.stdout.write(`${line}\n`);

const browser = await chromium.launch();
let failures = 0;
try {
  for (const [theme, lang] of variants) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    const runs = [
      ...groups.map((g) => [g, null]),
      ...Object.keys(overlays).map((k) => [k.split('-')[0], k]),
    ];
    for (const [group, overlay] of runs) {
      await page.goto(`${base}/dev/components/${group}?theme=${theme}&lang=${lang}`, {
        waitUntil: 'networkidle',
      });
      await page.waitForTimeout(500);
      if (overlay) {
        await overlays[overlay](page);
        await page.waitForTimeout(300);
      }
      await page.addScriptTag({ path: axePath });
      const result = await page.evaluate(
        (runTags) =>
          window.axe.run(document, {
            runOnly: { type: 'tag', values: runTags },
            exclude: [['nextjs-portal']],
          }),
        tags,
      );
      const name = `${overlay ?? group} ${theme} ${lang}`;
      if (result.violations.length === 0) {
        write(`ok    ${name} (${result.passes.length} rules passed)`);
        continue;
      }
      failures += result.violations.length;
      write(`FAIL  ${name}`);
      for (const v of result.violations) {
        write(`      ${v.id} (${v.impact}): ${v.help}`);
        for (const node of v.nodes.slice(0, 3)) write(`        ${node.target.join(' ')}`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}
write(failures ? `${failures} violations` : 'no violations');
process.exit(failures ? 1 : 0);
