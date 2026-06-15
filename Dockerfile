# ── Stage 1: builder ────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ── Stage 2: production ──────────────────────────────────────
FROM node:20-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Compiled JS
COPY --from=builder /app/dist ./dist

# Migrations folder (includes SQL files + meta/_journal.json)
COPY drizzle ./drizzle

# Migration + seed script
COPY migrate.sh ./migrate.sh
RUN chmod +x ./migrate.sh

EXPOSE 3000

CMD ["node", "dist/server.js"]
