/** The marketing pages. Middleware's matcher lists the same paths (it must be a literal). */
export const MARKETING_PATHS = [
  '/',
  '/pricing',
  '/security',
  '/faq',
  '/mcp',
  '/self-host',
  '/privacy',
  '/terms',
  '/dpa',
  '/subprocessors',
] as const;

export type MarketingPath = (typeof MARKETING_PATHS)[number];

export const isMarketingPath = (p: string): p is MarketingPath =>
  (MARKETING_PATHS as readonly string[]).includes(p);

export const GITHUB_URL = 'https://github.com/Heknon/AskCalls';
export const LEAK_TEST_URL = `${GITHUB_URL}/blob/master/apps/web/src/server/leak.test.ts`;
export const ADVISORY_URL = `${GITHUB_URL}/security/advisories/new`;
