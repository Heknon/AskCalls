import type { MetadataRoute } from 'next';
import { getContainer } from '../server/container';
import { MARKETING_PATHS } from './(marketing)/_data/routes';

export const dynamic = 'force-dynamic';

/** The public pages, one URL each: the language is chosen per visitor, not by URL. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { config } = await getContainer();
  const base = config.config.appUrl.replace(/\/$/, '');
  return MARKETING_PATHS.map((path) => ({
    url: `${base}${path === '/' ? '' : path}`,
    changeFrequency: 'monthly',
    priority: path === '/' ? 1 : 0.6,
  }));
}
