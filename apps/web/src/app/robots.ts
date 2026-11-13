import type { MetadataRoute } from 'next';
import { getContainer } from '../server/container';

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { config } = await getContainer();
  const base = config.config.appUrl.replace(/\/$/, '');
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app', '/admin', '/api/', '/cli/', '/dev/'] },
    sitemap: `${base}/sitemap.xml`,
  };
}
