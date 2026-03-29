FROM node:22.17.0-alpine
WORKDIR /app

# Copy workspace config and lockfile
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy ALL package.json files so pnpm can create workspace symlinks
COPY apps/api/package.json ./apps/api/
COPY apps/cli/package.json ./apps/cli/
COPY apps/mcp-server/package.json ./apps/mcp-server/
COPY apps/web/package.json ./apps/web/
COPY packages/auth/package.json ./packages/auth/
COPY packages/core/package.json ./packages/core/
COPY packages/infrastructure/package.json ./packages/infrastructure/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tools/package.json ./packages/tools/

# Install dependencies with workspace linking
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client from schema
RUN npx prisma generate

# Build all packages (turbo handles dependency order)
RUN pnpm exec turbo run build --filter=@kloudi/api...

EXPOSE 3001
CMD ["pnpm", "--filter", "@kloudi/api", "start"]
