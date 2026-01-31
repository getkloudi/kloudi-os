FROM node:22.17.0-alpine
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
EXPOSE 3000
CMD ["node", "apps/api/src/index.js"]
