import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
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
      // Self-hosted model, ONNX Runtime and ffmpeg.wasm files: versioned paths, public bytes.
      ...['/models/:path*', '/ort/:path*', '/ffmpeg/:path*'].map((source) => ({
        source,
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      })),
    ];
  },
};

export default config;
