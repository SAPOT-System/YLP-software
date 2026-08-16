# syntax=docker/dockerfile:1

FROM node:22-slim AS base

RUN corepack enable

WORKDIR /app

FROM base AS dependencies

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS development
ENV NODE_ENV=development
COPY . .

FROM dependencies AS builder

COPY . .
RUN pnpm build

FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
# Docker sets HOSTNAME to the container's own short ID; the standalone
# server.js falls back to it and listens there instead of all interfaces,
# so the in-container healthcheck against 127.0.0.1 gets ECONNREFUSED.
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Trust the private CA rather than a replaceable server leaf certificate.
EXPOSE 3000

CMD ["node", "server.js"]
