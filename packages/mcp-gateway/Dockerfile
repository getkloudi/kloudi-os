FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/mcp-gateway/package.json ./packages/mcp-gateway/
COPY packages/shared/package.json ./packages/shared/
COPY packages/infrastructure/package.json ./packages/infrastructure/

# Install deps
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy source
COPY packages/mcp-gateway/src ./packages/mcp-gateway/src
COPY packages/mcp-gateway/tsconfig.json ./packages/mcp-gateway/
COPY packages/shared/src ./packages/shared/src
COPY packages/infrastructure/src ./packages/infrastructure/src
COPY tsconfig.base.json ./

# Build
RUN pnpm --filter @kloudi/shared build
RUN pnpm --filter @kloudi/infrastructure build
RUN pnpm --filter @kloudi/mcp-gateway build

# ---- Production image ----
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3010

COPY --from=builder /app/packages/mcp-gateway/dist ./dist
COPY --from=builder /app/packages/mcp-gateway/package.json .
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3010

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3010/health || exit 1

CMD ["node", "dist/server.js"]
