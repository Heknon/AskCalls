import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const config: NextConfig = {
  output: 'standalone',
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
  webpack(webpackConfig) {
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
