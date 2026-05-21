# ─── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Stage 2: Runtime ───────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Apenas runtime deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /app/dist ./dist

# Roda como user não-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 proxy
USER proxy

EXPOSE 8080
ENV PORT=8080

CMD ["node", "dist/server.js"]
