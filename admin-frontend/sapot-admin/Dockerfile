# syntax=docker/dockerfile:1

FROM node:22-slim AS builder

RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Trust the private CA rather than a replaceable server leaf certificate.
EXPOSE 3000

CMD ["node", "server.js"]
