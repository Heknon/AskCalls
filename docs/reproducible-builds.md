# Reproducible builds

AskCalls decrypts your calls in the browser, so the JavaScript the server sends is part of the security model ([threat model, Code delivery](threat-model.md#code-delivery)). Two builds of the same commit produce byte-identical client JavaScript, and every release publishes the SHA-256 of each asset. Anyone can rebuild a tag and compare, and anyone can compare what askcalls.com serves against those hashes.

## What makes the build deterministic

- **Pinned toolchain and dependencies.** Bun's version is `packageManager` in `package.json`; every dependency is pinned exactly in `bun.lock`, and installs run with `--frozen-lockfile`.
- **Content-hashed chunks.** Next.js names every chunk after a hash of its content.
- **A fixed build id.** Next.js names `/_next/static/<build id>/` with a random id by default. `apps/web/next.config.ts` uses the commit (`git rev-parse HEAD`), or `ASKCALLS_BUILD_ID` where there is no `.git` (the Docker build passes the commit as a build argument).
- **A stable chunk order.** The webpack runtime lists chunk file names in the order it walks chunk groups, which follows module build completion and varies between runs. The `StableChunkOrder` plugin in `next.config.ts` sorts the groups once chunk ids are fixed.
- **No server actions in browser code.** Next.js salts server action ids with a random per-build key, so a client component calling one would ship a chunk that changes on every build. Browser code calls API routes (`packages/api-contract`); `apps/web/src/reproducible.test.ts` fails if a client module imports a `'use server'` module.
- **No build-time configuration in client code.** Instance settings that reach the browser (the embedding model host) arrive at runtime in a meta tag, so one build serves every instance and the hosted site serves the same bytes as a self-hosted build.

Checked by building twice from a clean `apps/web/.next` and comparing `bun run release:hashes` output.

## Verify a release

Each GitHub release lists the SHA-256 of every client JS asset under "Client JavaScript", and the same list as `client-assets.sha256`.

### Rebuild it yourself

```sh
git clone https://github.com/Heknon/AskCalls.git && cd AskCalls
git checkout v1.2.3
bun install --frozen-lockfile        # with the Bun version in package.json
ASKCALLS_SKIP_MODEL_DOWNLOAD=1 bun run --cwd apps/web build
bun run release:hashes > mine.sha256
curl -sL https://github.com/Heknon/AskCalls/releases/download/v1.2.3/client-assets.sha256 > release.sha256
diff mine.sha256 release.sha256 && echo identical
```

The model download only places model files under `public/`; it does not change any JavaScript, so skipping it saves time.

### Check what askcalls.com serves

Every path in the list is public, so fetch each one from the site and hash it:

```sh
while read -r sum path; do
  got=$(curl -fsS "https://askcalls.com$path" | sha256sum | cut -d' ' -f1)
  [ "$got" = "$sum" ] || echo "MISMATCH $path"
done < release.sha256
```

To check the exact code your browser runs, open DevTools → Network on an `/app` page, filter by JS, and compare the `/_next/static/…` files it loaded with the list. The app's CSP (`script-src 'self' 'nonce-…'`) means no script from another origin can run on app pages; the inline scripts are Next.js's bootstrap data and carry the per-response nonce.

A match proves the code you were served is the code in the tag. It cannot prove the server serves everyone the same code on every visit; publishing the hashes makes a targeted change detectable by anyone who looks.

## Other release artifacts

- **npm package** `askcalls`: published with npm provenance, so `npm audit signatures` ties it to the release workflow run; its tarball's SHA-256 is in the release's `SHA256SUMS`.
- **Docker image** `ghcr.io/heknon/askcalls:<version>`: built from the tagged commit with `ASKCALLS_BUILD_ID` set to it, with a build provenance attestation. The client assets inside it (`apps/web/.next/static`) hash to the same list.
- **Offline bundles** `askcalls-offline-<version>-<arch>.tar.gz`: the image as a `docker load` tarball, the agent binaries and npm package, the Compose files, and a `SHA256SUMS` of their contents.

## Try a release locally

```sh
bun run release:dry-run
```

Builds the web app, hashes the client assets, packs the npm package, compiles the agent for this platform, builds the Docker image for this architecture and assembles the offline bundle and release notes in `dist/release/`, publishing nothing. `--skip-docker` leaves out the image and the bundle.
