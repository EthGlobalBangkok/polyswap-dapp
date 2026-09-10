# syntax=docker/dockerfile:1.7

FROM node:24.14-alpine AS dependencies

WORKDIR /app

ENV HUSKY=0

RUN corepack enable \
    && corepack prepare pnpm@11.0.0 --activate \
    && apk add --no-cache python3 make g++

# Dependency installation and Prisma generation never need runtime secrets.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN pnpm install --frozen-lockfile \
    && pnpm prune --prod --ignore-scripts

FROM node:24.14-alpine AS listener

WORKDIR /app

ENV NODE_ENV=production

# The runtime contains only the listener sources and production dependencies.
# Secrets are supplied when the container starts with Docker's --env-file.
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.json sentry.server.config.ts ./
COPY --chown=node:node src/abi ./src/abi
COPY --chown=node:node src/backend ./src/backend
COPY --chown=node:node src/lib/env.ts ./src/lib/env.ts
COPY --chown=node:node src/lib/rpc ./src/lib/rpc

USER node

STOPSIGNAL SIGTERM

CMD ["./node_modules/.bin/tsx", "src/backend/listener/index.ts"]
