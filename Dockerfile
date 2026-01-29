FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and prisma config
COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Generate Prisma client
RUN pnpm exec prisma generate

COPY . .

RUN pnpm run build

FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
# Copy prisma files for runtime - keep in original location
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

EXPOSE 3006

CMD ["pnpm", "run", "start"]
