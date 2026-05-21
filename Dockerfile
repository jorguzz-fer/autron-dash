# ─── Stage 1: Dependências ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app

# Atualiza npm para a mesma major usada no dev (lockfile foi gerado com npm 11).
# O node:22-alpine vem com npm 10, que é mais estrito com optional peer deps
# (caso do @emnapi/runtime — falha com "Missing from lock file" no npm ci).
RUN npm install -g npm@11

COPY package.json package-lock.json ./
COPY prisma ./prisma

RUN npm ci --ignore-scripts

# ─── Stage 2: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# NODE_ENV=production faz o Next.js usar cache do Prisma corretamente
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Limita o heap do V8 — força GC mais agressivo e evita que o processo
# estoure o limite de memória do container (OOM kill = exit 255) no
# `next build` da VPS do Coolify.
ENV NODE_OPTIONS=--max-old-space-size=2048

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Gera o Prisma Client ANTES do build do Next.
# Binary local (não `npx`) — evita baixar Prisma v7 e overhead extra.
RUN ./node_modules/.bin/prisma generate

RUN npm run build

# ─── Stage 3: Runner ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Prisma Client WASM e binários — necessário em runtime (sem o CLI)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# bcryptjs — usado pelo seed-admin.js no terminal Coolify
COPY --from=builder /app/node_modules/bcryptjs ./node_modules/bcryptjs

# Migrations (consumidas pelo run-migrations.js)
COPY --from=builder /app/prisma ./prisma

# Scripts utilitários (migration runner + seed)
COPY --from=builder /app/scripts ./scripts

# Entrypoint roda migration customizada antes de subir o servidor
COPY entrypoint.sh ./entrypoint.sh

RUN chown -R nextjs:nodejs /app && \
    chmod +x /app/entrypoint.sh

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/app/entrypoint.sh"]
