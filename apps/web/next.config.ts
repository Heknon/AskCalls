import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/**
 * The build id names /_next/static/<id>/; Next.js makes a random one by default. The commit
 * (or ASKCALLS_BUILD_ID where there is no .git, as in the Docker build) keeps two builds of
 * the same commit byte-identical (docs/reproducible-builds.md).
 */
function buildId(): string | null {
  if (process.env.ASKCALLS_BUILD_ID) return process.env.ASKCALLS_BUILD_ID;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

type Ordered = { sortWith(compare: (a: never, b: never) => number): void } | undefined;
interface Group {
  name?: string | null;
  id: string;
  _children?: Ordered;
}
interface Compilation {
  chunkGroups: Group[];
  chunks: Iterable<{ _groups?: Ordered }>;
  hooks: { afterOptimizeChunkIds: { tap(name: string, fn: () => void): void } };
}

/**
 * The webpack runtime maps chunk ids to file names in the order it walks chunk groups, which
 * follows module build completion and so varies between builds. Sorting the groups by name and
 * id once ids are fixed makes the runtime chunk, and so every client asset, the same on every
 * build of a commit (docs/reproducible-builds.md).
 */
class StableChunkOrder {
  apply(compiler: {
    hooks: { compilation: { tap(n: string, fn: (c: Compilation) => void): void } };
  }) {
    const key = (g: Group) => `${g.name ?? ''}\0${g.id}`;
    const byKey = (a: Group, b: Group) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
    compiler.hooks.compilation.tap('StableChunkOrder', (compilation) => {
      compilation.hooks.afterOptimizeChunkIds.tap('StableChunkOrder', () => {
        for (const group of compilation.chunkGroups) group._children?.sortWith(byKey as never);
        for (const chunk of compilation.chunks) chunk._groups?.sortWith(byKey as never);
      });
    });
  }
}

const config: NextConfig = {
  output: 'standalone',
  // The monorepo root, so the standalone output is laid out as `apps/web/server.js` wherever
  // the checkout sits (Docker and the `askcalls local` bundle copy it as is).
  outputFileTracingRoot: join(import.meta.dirname, '..', '..'),
  generateBuildId: async () => buildId(),
  reactStrictMode: true,
  poweredByHeader: false,
  // Put generateMetadata output in <head> for every client, not only known bots: marketing
  // pages' descriptions and canonical links must be in the head (Lighthouse SEO, link previews).
  htmlLimitedBots: /.*/,
  transpilePackages: [
    '@askcalls/domain',
    '@askcalls/api-contract',
    '@askcalls/client-core',
    '@askcalls/crypto',
    '@askcalls/indexing',
    '@askcalls/transcript-formats',
    '@askcalls/ui',
    '@askcalls/adapter-mocks',
    '@askcalls/adapter-runtime',
    '@askcalls/adapter-blob-fs',
    '@askcalls/adapter-blob-s3',
    '@askcalls/adapter-transcription-elevenlabs',
    '@askcalls/adapter-transcription-openai',
    '@askcalls/adapter-transcription-deepgram',
    '@askcalls/adapter-transcription-soniox',
    '@askcalls/adapter-transcription-openai-compatible',
    '@askcalls/adapter-llm-ai-sdk',
    '@askcalls/adapter-telemetry-otel',
    '@askcalls/adapter-telemetry-posthog',
    '@askcalls/adapter-telemetry-sentry',
    '@askcalls/adapter-telemetry-umami',
    '@askcalls/adapter-db-postgres',
  ],
  // Database drivers load native/WebAssembly assets at runtime: keep them out of the bundle.
  serverExternalPackages: ['pg', '@electric-sql/pglite', '@electric-sql/pglite-pgvector'],
  webpack(webpackConfig, { isServer }) {
    if (!isServer) webpackConfig.plugins.push(new StableChunkOrder());
    // onnxruntime-web references its own WebAssembly with `new URL(…, import.meta.url)`, which
    // would emit a second 27 MB copy. The embedder always loads it from /ort (assets.ts).
    webpackConfig.module.rules.push({
      test: /[\\/]onnxruntime-web[\\/]dist[\\/].*\.m?js$/,
      parser: { url: false },
    });
    return webpackConfig;
  },
  // The CSP for /app/** and /admin/** is set per request by middleware (nonce for Next.js
  // bootstrap scripts).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=()' },
        ],
      },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      // The service worker must be re-checked on every load so a new shell rule ships at once.
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
      {
        source: '/icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
      // Self-hosted model, ONNX Runtime, ffmpeg.wasm and font files: versioned paths, public bytes.
      ...['/models/:path*', '/ort/:path*', '/ffmpeg/:path*', '/fonts/:path*'].map((source) => ({
        source,
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      })),
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(config);
