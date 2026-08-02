# syntax=docker/dockerfile:1

FROM node:22-slim

RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Trust the private CA rather than a replaceable server leaf certificate.
ENV NODE_EXTRA_CA_CERTS=/app/certs/server_ca.pem
EXPOSE 3000

CMD ["pnpm", "dev"]
