# syntax=docker/dockerfile:1.7
# AskCalls web app: Next.js standalone build served by Node.

FROM oven/bun:1.4.4 AS build
WORKDIR /repo
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun install --frozen-lockfile && bun run --cwd apps/web build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 ASKCALLS_DATA_DIR=/data
RUN useradd --system --uid 1001 askcalls && mkdir -p /data && chown askcalls /data
COPY --from=build --chown=askcalls /repo/apps/web/.next/standalone ./
COPY --from=build --chown=askcalls /repo/apps/web/.next/static ./apps/web/.next/static
USER askcalls
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
