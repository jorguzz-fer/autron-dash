# Autron Dash v2

Dashboard de gestão de pedidos, follow-up, estoque e faturamento da Autron — reescrita do dashboard original (Streamlit) em Next.js 15 + TypeScript + Prisma 6 + Auth.js v5 + Tailwind 4.

## Stack

- **Framework:** Next.js 15 (App Router, Turbopack, standalone output)
- **Linguagem:** TypeScript strict
- **Banco:** Postgres via Prisma 6
- **Auth:** Auth.js v5 (Credentials + bcryptjs, sessão JWT 8h)
- **Multi-tenant:** modelo `Tenant` + isolamento por `tenantId` em todos os datasets
- **Auditoria:** `AuditLog` em ações sensíveis
- **Rate limit:** baseado em DB (`RateLimitHit`)
- **Security headers:** HSTS, CSP, X-Frame-Options, Permissions-Policy
- **UI:** Tailwind 4 + template Trezo (em fases posteriores)
- **Charts:** ApexCharts (em fases posteriores)
- **Parser de planilhas:** xlsx (em fases posteriores)

## Funcionalidades planejadas

Reescrita facelift completo (visual + arquitetural) do dashboard Autron original. Mantém toda a inteligência de negócio:

- 5 abas: Visão Geral, Prontidão, Previsão Entrega, Estoque & SC/OP, Faturamento
- Upload manual de 5 planilhas Protheus (entrada_pedido, followup, mata010, faturamento, sciozvs0)
- Persistência em Postgres
- Auth + multi-tenant + audit log + rate limit + LGPD
- Filtro global por período em todas as abas
- Gráficos clicáveis que filtram a tabela

## Setup local

```bash
# 1) Dependências
npm install

# 2) Variáveis de ambiente
cp .env.example .env
# Edite o .env. Mínimo necessário:
#   DATABASE_URL=postgresql://...
#   AUTH_SECRET=$(openssl rand -base64 32)
#   SEED_ADMIN_PASSWORD=...    (mínimo 10 caracteres)

# 3) Banco: cria a primeira migration e aplica
npx prisma migrate dev --name init

# 4) Seed: cria tenant Autron + admin
npm run db:seed

# 5) Sobe o servidor de dev
npm run dev
```

App disponível em http://localhost:3000.

## Estrutura

```
src/
  app/
    api/auth/[...nextauth]/route.ts   ← handler do Auth.js
    login/                             ← /login (público)
    dashboard/                         ← /dashboard (protegido)
    privacidade/                       ← /privacidade (público, LGPD)
    layout.tsx, page.tsx, globals.css
  lib/
    db.ts          ← Prisma singleton
    auth.ts        ← config Auth.js v5 (Credentials + rate limit)
    authz.ts       ← helpers de role: requireAuth/requireRole
    audit.ts       ← logAudit() + getClientIp/UserAgent
    password.ts    ← política de senha (10+ chars, 3 classes)
    rateLimit.ts   ← rate limit DB-based
  middleware.ts    ← protege rotas, redireciona pra /login
  types/next-auth.d.ts ← augmenta Session com tenantId/role

prisma/
  schema.prisma    ← Tenant, User, Session, AuditLog, RateLimitHit, LGPDConsent
  seed.ts          ← cria tenant Autron + admin
```

## Roles

| Role     | Permissão típica                                       |
|----------|---------------------------------------------------------|
| ADMIN    | Tudo (gerenciar usuários, configs, dados)               |
| DIRETOR  | Acessos externos, leitura ampla, downloads              |
| GERENTE  | Gestão operacional + uploads + edições                  |
| OPERADOR | Uploads + edições limitadas                             |
| VIEWER   | Somente leitura                                         |

Helpers em `src/lib/authz.ts`: `ROLES_ADMIN`, `ROLES_MANAGE`, `ROLES_WRITE`, `ROLES_READ`.

## Segurança aplicada

- Senha: bcrypt 12 rounds, mín. 10 chars + 3 classes (lower/upper/digit/symbol), blacklist de senhas comuns
- Sessão: JWT 8h, atualização de validade a cada 1h
- Rate limit: 20 logins/15min por IP, 10 logins/hora por email
- Headers: HSTS preload, CSP restritiva, X-Frame DENY, Referrer strict-origin
- Audit log: tabela `AuditLog` com `tenantId/userId/action/entity/entityId/meta/ip/userAgent`
- LGPD: política em `/privacidade`, modelo `LGPDConsent` versionado, retenção definida (5 anos para fiscais)
- Multi-tenant: `@@unique([tenantId, email])` no User; toda query de dados deve filtrar por `tenantId`

## Deploy

Coolify via Dockerfile multi-stage (mesma receita da Funcional Farma). Documentação em `DEPLOY_COOLIFY.md` (a ser adicionado na Fase 10).
