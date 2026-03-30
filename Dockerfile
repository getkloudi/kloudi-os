FROM node:22.17.0-alpine
WORKDIR /app

# Install turbo globally for build orchestration
RUN npm install -g turbo

# Copy everything — no manual package.json enumeration that breaks when packages change
COPY . .

# Install dependencies
RUN corepack enable && pnpm install --frozen-lockfile

# Generate Prisma client
RUN npx prisma generate

# Build API and all its dependencies (turbo resolves the graph automatically)
RUN pnpm exec turbo run build --filter=@kloudi/api...

EXPOSE 3001
CMD ["pnpm", "--filter", "@kloudi/api", "start"]
