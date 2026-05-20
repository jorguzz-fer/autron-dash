# Chat IA Empresarial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disponibilizar Chat IA empresarial (Open WebUI self-hosted + LiteLLM com 3 provedores) integrado ao autron-dash via SSO trusted-header, com link "Chat IA" no sidebar que cai direto logado.

**Architecture:** Duas frentes integradas. (1) autron-dash emite JWT HS256 curto (5min, one-time) ao clicar no link; (2) mini-proxy Hono na VPS IA valida JWT, seta cookie de sessão de 8h, injeta `X-Forwarded-Email`/`X-Forwarded-Name` em todas as requisições proxiadas pro Open WebUI, que confia nesses headers (trusted-header auth nativo). LiteLLM roteia Claude/GPT/Gemini sob a mesma interface OpenAI-compat.

**Tech Stack:** Next.js 15 (autron-dash, já existe) · Auth.js v5 · `jose` (JWT) · Vitest · Hono (mini-proxy, novo repo) · Open WebUI + LiteLLM (Coolify) · Anthropic + OpenAI + Gemini APIs

**Spec de referência:** `docs/superpowers/specs/2026-05-20-chat-ia-openwebui-sso-design.md` (commit `b9f59b9`)

---

## Phase 0 — Preparação no autron-dash

### Task 0.1: Adicionar `jose` como dep direta

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar `jose` como dep direta**

```bash
cd /Users/fernandojorge/Desktop/Projetos/apps/autron-dash
npm install jose
```

- [ ] **Step 2: Verificar que entrou no `package.json`**

```bash
grep '"jose"' package.json
```

Expected: linha como `"jose": "^5.x.x"` (ou versão atual) na seção `dependencies`.

- [ ] **Step 3: Verificar que TypeScript compila**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "error TS" | head
```

Expected: sem saída (zero erros).

- [ ] **Step 4: Commit + push**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): adicionar jose como dep direta (uso no SSO de Chat IA)"
git push
```

---

## Phase 1 — autron-dash: helper de assinatura JWT (TDD)

### Task 1.1: Criar testes do `signSsoJwt` (failing)

**Files:**
- Create: `src/lib/iaSso.test.ts`

- [ ] **Step 1: Criar o arquivo de teste**

```typescript
// src/lib/iaSso.test.ts
import { describe, it, expect } from "vitest";
import { jwtVerify } from "jose";
import { signSsoJwt } from "./iaSso";

const SECRET = "test-secret-pelo-menos-32-bytes-pra-hs256-ok";

describe("signSsoJwt", () => {
  it("retorna JWT que verifica com a mesma chave", async () => {
    const token = await signSsoJwt(
      { email: "f@a.com", name: "F", userId: "u1", tenantId: "t1" },
      SECRET,
    );
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      issuer: "autron-dash",
    });
    expect(payload.email).toBe("f@a.com");
    expect(payload.name).toBe("F");
    expect(payload.userId).toBe("u1");
    expect(payload.tenantId).toBe("t1");
    expect(payload.iss).toBe("autron-dash");
    expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("expira em ~5 minutos", async () => {
    const token = await signSsoJwt(
      { email: "f@a.com", name: "F", userId: "u1", tenantId: "t1" },
      SECRET,
    );
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(now);
    expect(payload.exp).toBeLessThanOrEqual(now + 5 * 60 + 2);
  });

  it("rejeita verificação com chave errada", async () => {
    const token = await signSsoJwt(
      { email: "f@a.com", name: "F", userId: "u1", tenantId: "t1" },
      SECRET,
    );
    await expect(
      jwtVerify(token, new TextEncoder().encode("chave-errada-tambem-com-32-bytes-pra-padding")),
    ).rejects.toThrow();
  });

  it("gera um jti único a cada chamada", async () => {
    const t1 = await signSsoJwt({ email: "x", name: "x", userId: "x", tenantId: "x" }, SECRET);
    const t2 = await signSsoJwt({ email: "x", name: "x", userId: "x", tenantId: "x" }, SECRET);
    const p1 = (await jwtVerify(t1, new TextEncoder().encode(SECRET))).payload;
    const p2 = (await jwtVerify(t2, new TextEncoder().encode(SECRET))).payload;
    expect(p1.jti).not.toBe(p2.jti);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que FALHA**

```bash
npx vitest run src/lib/iaSso.test.ts
```

Expected: erro tipo `Cannot find module './iaSso'` ou similar (módulo ainda não existe).

### Task 1.2: Implementar `signSsoJwt`

**Files:**
- Create: `src/lib/iaSso.ts`

- [ ] **Step 1: Implementar o helper mínimo**

```typescript
// src/lib/iaSso.ts
import { SignJWT } from "jose";

export interface IaSsoPayload {
  email: string;
  name: string;
  userId: string;
  tenantId: string;
}

/**
 * Assina um JWT HS256 curto (5min) para handshake SSO com a instância
 * do Chat IA (Open WebUI via mini-proxy). One-time-use garantido pelo
 * mini-proxy via cache de `jti`.
 */
export async function signSsoJwt(
  payload: IaSsoPayload,
  secret: string,
): Promise<string> {
  const secretKey = new TextEncoder().encode(secret);
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("autron-dash")
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(crypto.randomUUID())
    .sign(secretKey);
}
```

- [ ] **Step 2: Rodar testes e confirmar que PASSAM**

```bash
npx vitest run src/lib/iaSso.test.ts
```

Expected: 4 testes ✅ passing.

- [ ] **Step 3: Verificar TypeScript**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "iaSso\|error TS" | head
```

Expected: sem saída (sem erros de tipo).

- [ ] **Step 4: Commit + push**

```bash
git add src/lib/iaSso.ts src/lib/iaSso.test.ts
git commit -m "feat(ia-sso): helper signSsoJwt + testes (HS256, 5min TTL, jti único)"
git push
```

---

## Phase 2 — autron-dash: rota /chat-ia

### Task 2.1: Criar Server Component `/chat-ia`

**Files:**
- Create: `src/app/chat-ia/page.tsx`

- [ ] **Step 1: Criar o Server Component**

```tsx
// src/app/chat-ia/page.tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { signSsoJwt } from "@/lib/iaSso";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * GET /chat-ia
 *
 * Handshake SSO com o Chat IA (Open WebUI via mini-proxy).
 * Verifica sessão, emite JWT curto, registra audit e redireciona
 * para `${IA_CHAT_URL}/sso?token=<jwt>`.
 *
 * Spec: docs/superpowers/specs/2026-05-20-chat-ia-openwebui-sso-design.md §4
 */
export default async function ChatIaPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const secret = process.env.IA_SSO_SECRET;
  const url = process.env.IA_CHAT_URL;
  if (!secret || !url) {
    throw new Error(
      "Chat IA não configurado — defina IA_SSO_SECRET e IA_CHAT_URL no ambiente",
    );
  }

  const token = await signSsoJwt(
    {
      email: session.user.email!,
      name: session.user.name ?? session.user.email!,
      userId: session.user.id,
      tenantId: session.user.tenantId,
    },
    secret,
  );

  const reqHeaders = await headers();
  const xff = reqHeaders.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0].trim() : reqHeaders.get("x-real-ip");

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "ia.chat.access",
    entity: "IA",
    meta: { provider: "open-webui" },
    ip,
    userAgent: reqHeaders.get("user-agent"),
  });

  redirect(`${url}/sso?token=${token}`);
}
```

- [ ] **Step 2: Verificar build**

```bash
npm run build 2>&1 | grep -E "chat-ia|error|Failed" | head
```

Expected: a rota `/chat-ia` aparece na lista de routes (ex: `ƒ /chat-ia`); sem erros.

- [ ] **Step 3: Commit + push**

```bash
git add src/app/chat-ia/page.tsx
git commit -m "feat(chat-ia): rota Server Component que emite JWT SSO e redireciona"
git push
```

---

## Phase 3 — autron-dash: link no Sidebar

### Task 3.1: Adicionar "Chat IA" no NAV_TOOLS do Sidebar

**Files:**
- Modify: `src/components/Layout/Sidebar.tsx`

- [ ] **Step 1: Adicionar import do ícone `Sparkles`**

Localize o bloco de imports do `lucide-react` (linha ~5-19) e adicione `Sparkles` na ordem alfabética:

```tsx
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  GitCompareArrows,
  LayoutDashboard,
  LineChart,
  LogOut,
  Package,
  Receipt,
  Scale,
  ScrollText,
  Sparkles,      // ← novo
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";
```

- [ ] **Step 2: Adicionar o item em `NAV_TOOLS`**

Localize o array `NAV_TOOLS` (busca por `const NAV_TOOLS`) e adicione o item após `Upload de planilhas`:

```tsx
const NAV_TOOLS: NavItem[] = [
  { label: "Upload de planilhas", href: "/uploads", icon: Upload },
  { label: "Chat IA", href: "/chat-ia", icon: Sparkles },
];
```

- [ ] **Step 3: Verificar build**

```bash
npm run build 2>&1 | grep -E "chat-ia|error|Failed" | head
```

Expected: build OK, rota presente.

- [ ] **Step 4: Commit + push**

```bash
git add src/components/Layout/Sidebar.tsx
git commit -m "feat(sidebar): link Chat IA em NAV_TOOLS (visivel para todos os usuarios ativos)"
git push
```

---

## Phase 4 — Mini-proxy SSO (novo repo)

### Task 4.1: Criar repo `autron-ia-sso-proxy` no GitHub

**Files:**
- Local: novo diretório `/Users/fernandojorge/Desktop/Projetos/apps/autron-ia-sso-proxy/`

- [ ] **Step 1: Criar o diretório e inicializar git**

```bash
cd /Users/fernandojorge/Desktop/Projetos/apps
mkdir autron-ia-sso-proxy
cd autron-ia-sso-proxy
git init -b main
```

- [ ] **Step 2: Criar `.gitignore`**

```bash
cat > .gitignore <<'EOF'
node_modules/
dist/
.env
.env.local
*.log
.DS_Store
EOF
```

- [ ] **Step 3: Criar repo remoto no GitHub e push inicial**

```bash
gh repo create jorguzz-fer/autron-ia-sso-proxy --private --source=. --remote=origin
git add .gitignore
git commit -m "chore: init repo"
git push -u origin main
```

Expected: repo criado em `https://github.com/jorguzz-fer/autron-ia-sso-proxy`.

### Task 4.2: Bootstrap do projeto Hono

**Files:**
- Create: `package.json`, `tsconfig.json`, `.env.example`, `README.md`

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "autron-ia-sso-proxy",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "hono": "^4.6.0",
    "jose": "^5.9.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Criar `.env.example`**

```bash
cat > .env.example <<'EOF'
# Chave compartilhada com o autron-dash (mesmo valor de IA_SSO_SECRET lá).
# Gerar com: openssl rand -base64 32
IA_SSO_SECRET=

# URL interna do Open WebUI (rede Docker do Coolify).
UPSTREAM_URL=http://open-webui:8080

# Porta exposta pelo container.
PORT=3001
EOF
```

- [ ] **Step 4: Criar `README.md`**

```markdown
# autron-ia-sso-proxy

Mini-proxy SSO em Hono que valida JWT do autron-dash e injeta
`X-Forwarded-Email`/`X-Forwarded-Name` em todas as requisições
proxiadas pro Open WebUI (que confia nesses headers via
`WEBUI_AUTH_TRUSTED_EMAIL_HEADER`).

## Endpoints

- `GET /sso?token=<jwt>` — valida JWT (assinatura HS256, expiração,
  `jti` one-time-use), seta cookie de sessão de 8h, redireciona para `/`.
- `GET /verify` — endpoint interno usado pelo proxy: lê cookie, valida,
  retorna 200 + headers ou 401.
- `*` — catch-all: lê cookie, valida, injeta headers, proxy
  pro `UPSTREAM_URL`.

## Envs obrigatórias

- `IA_SSO_SECRET` — mesma do autron-dash
- `UPSTREAM_URL` — ex: `http://open-webui:8080`
- `PORT` — default 3001

## Deploy

Container Docker via Coolify. Ver `Dockerfile`.

## Spec original

`autron-dash/docs/superpowers/specs/2026-05-20-chat-ia-openwebui-sso-design.md`
```

- [ ] **Step 5: Instalar deps**

```bash
npm install
```

- [ ] **Step 6: Commit + push**

```bash
git add package.json package-lock.json tsconfig.json .env.example README.md
git commit -m "chore: bootstrap projeto Hono + TS + Vitest"
git push
```

### Task 4.3: Testes do helper de verificação de JWT (failing)

**Files:**
- Create: `src/jwt.test.ts`

- [ ] **Step 1: Criar `src/jwt.test.ts`**

```typescript
// src/jwt.test.ts
import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { verifySsoToken, type SsoSession } from "./jwt";

const SECRET = "shared-secret-32bytes-pra-hs256-aaaaaaaaaaa";
const KEY = new TextEncoder().encode(SECRET);

async function makeToken(overrides: Partial<{
  email: string; name: string; userId: string; tenantId: string;
  exp: string; iss: string; jti: string;
}> = {}) {
  const j = new SignJWT({
    email: overrides.email ?? "f@a.com",
    name: overrides.name ?? "F",
    userId: overrides.userId ?? "u1",
    tenantId: overrides.tenantId ?? "t1",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(overrides.iss ?? "autron-dash")
    .setIssuedAt()
    .setExpirationTime(overrides.exp ?? "5m");
  if (overrides.jti !== undefined) j.setJti(overrides.jti);
  else j.setJti(crypto.randomUUID());
  return j.sign(KEY);
}

describe("verifySsoToken", () => {
  it("retorna payload válido pra token bem-formado", async () => {
    const t = await makeToken();
    const r = await verifySsoToken(t, SECRET);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.session.email).toBe("f@a.com");
      expect(r.session.name).toBe("F");
      expect(r.session.jti).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("rejeita token assinado com chave diferente", async () => {
    const t = await new SignJWT({ email: "f@a.com", name: "F", userId: "u1", tenantId: "t1" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("autron-dash")
      .setExpirationTime("5m")
      .setJti(crypto.randomUUID())
      .sign(new TextEncoder().encode("outra-chave-32bytes-pra-padding-abcdefghi"));
    const r = await verifySsoToken(t, SECRET);
    expect(r.ok).toBe(false);
  });

  it("rejeita token expirado", async () => {
    const t = await makeToken({ exp: "0s" });
    // espera um pouquinho pra garantir expiração
    await new Promise((res) => setTimeout(res, 50));
    const r = await verifySsoToken(t, SECRET);
    expect(r.ok).toBe(false);
  });

  it("rejeita issuer errado", async () => {
    const t = await makeToken({ iss: "outro-emissor" });
    const r = await verifySsoToken(t, SECRET);
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar FALHA**

```bash
npm test
```

Expected: erro `Cannot find module './jwt'` ou similar.

### Task 4.4: Implementar `verifySsoToken`

**Files:**
- Create: `src/jwt.ts`

- [ ] **Step 1: Implementar**

```typescript
// src/jwt.ts
import { jwtVerify } from "jose";

export interface SsoSession {
  email: string;
  name: string;
  userId: string;
  tenantId: string;
  jti: string;
}

export type VerifyResult =
  | { ok: true; session: SsoSession }
  | { ok: false; reason: string };

/**
 * Valida um JWT SSO emitido pelo autron-dash.
 * - Assinatura HS256 com a `secret` compartilhada
 * - Issuer = "autron-dash"
 * - Expiração não passada
 * Retorna o payload normalizado em caso de sucesso.
 */
export async function verifySsoToken(
  token: string,
  secret: string,
): Promise<VerifyResult> {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { issuer: "autron-dash" },
    );
    if (
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.tenantId !== "string" ||
      typeof payload.jti !== "string"
    ) {
      return { ok: false, reason: "payload incompleto" };
    }
    return {
      ok: true,
      session: {
        email: payload.email,
        name: payload.name,
        userId: payload.userId,
        tenantId: payload.tenantId,
        jti: payload.jti,
      },
    };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}
```

- [ ] **Step 2: Rodar testes e confirmar PASSAM**

```bash
npm test
```

Expected: 4 testes ✅.

- [ ] **Step 3: Commit + push**

```bash
git add src/jwt.ts src/jwt.test.ts
git commit -m "feat: verifySsoToken (valida assinatura, issuer, expiracao)"
git push
```

### Task 4.5: Testes do cache anti-replay de `jti`

**Files:**
- Create: `src/jtiCache.test.ts`

- [ ] **Step 1: Criar teste**

```typescript
// src/jtiCache.test.ts
import { describe, it, expect } from "vitest";
import { createJtiCache } from "./jtiCache";

describe("jtiCache", () => {
  it("aceita um jti novo e rejeita o mesmo reusado", () => {
    const cache = createJtiCache({ ttlMs: 10_000 });
    expect(cache.tryConsume("abc-123")).toBe(true);
    expect(cache.tryConsume("abc-123")).toBe(false);
  });

  it("aceita jtis diferentes em sequência", () => {
    const cache = createJtiCache({ ttlMs: 10_000 });
    expect(cache.tryConsume("a")).toBe(true);
    expect(cache.tryConsume("b")).toBe(true);
    expect(cache.tryConsume("c")).toBe(true);
  });

  it("expira entradas após TTL", () => {
    const now = { value: 1000 };
    const cache = createJtiCache({ ttlMs: 100, now: () => now.value });
    expect(cache.tryConsume("x")).toBe(true);
    now.value = 1099;
    expect(cache.tryConsume("x")).toBe(false); // ainda dentro do TTL
    now.value = 1101;
    expect(cache.tryConsume("x")).toBe(true); // já expirou, pode usar de novo
  });
});
```

- [ ] **Step 2: Rodar e confirmar FALHA**

```bash
npm test
```

Expected: erro `Cannot find module './jtiCache'`.

### Task 4.6: Implementar `jtiCache`

**Files:**
- Create: `src/jtiCache.ts`

- [ ] **Step 1: Implementar**

```typescript
// src/jtiCache.ts
export interface JtiCache {
  /** Retorna true se foi consumido com sucesso (primeira vez), false se reuso. */
  tryConsume(jti: string): boolean;
}

export interface JtiCacheOpts {
  ttlMs: number;
  now?: () => number;
}

/**
 * Cache in-memory de jtis já consumidos. Implementa one-time-use anti-replay
 * do JWT SSO. Entradas expiram após `ttlMs` (deve ser >= TTL do JWT pra
 * cobrir replays no período).
 *
 * Não é thread-safe entre processos — OK pra um proxy single-instance.
 * Se houver scale-out, trocar por Redis.
 */
export function createJtiCache(opts: JtiCacheOpts): JtiCache {
  const seen = new Map<string, number>(); // jti → expiresAt
  const now = opts.now ?? (() => Date.now());

  // GC a cada minuto (no-op se vazio)
  setInterval(() => {
    const t = now();
    for (const [jti, exp] of seen) {
      if (exp < t) seen.delete(jti);
    }
  }, 60_000).unref?.();

  return {
    tryConsume(jti: string): boolean {
      const t = now();
      const exp = seen.get(jti);
      if (exp !== undefined && exp >= t) return false;
      seen.set(jti, t + opts.ttlMs);
      return true;
    },
  };
}
```

- [ ] **Step 2: Rodar e confirmar PASSAM**

```bash
npm test
```

Expected: todos os testes ✅.

- [ ] **Step 3: Commit + push**

```bash
git add src/jtiCache.ts src/jtiCache.test.ts
git commit -m "feat: cache anti-replay de jti (one-time-use)"
git push
```

### Task 4.7: Servidor Hono — endpoints /sso e /verify + catch-all proxy

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implementar o servidor**

```typescript
// src/index.ts
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { setCookie, getCookie } from "hono/cookie";
import { SignJWT, jwtVerify } from "jose";
import { verifySsoToken } from "./jwt";
import { createJtiCache } from "./jtiCache";

const SECRET = required("IA_SSO_SECRET");
const UPSTREAM = process.env.UPSTREAM_URL ?? "http://open-webui:8080";
const PORT = Number(process.env.PORT ?? 3001);
const COOKIE_NAME = "ia-sso-session";
const COOKIE_MAX_AGE_SEC = 8 * 60 * 60; // 8h
const JTI_TTL_MS = 10 * 60 * 1000;       // 10min (> 5min do JWT)

const secretKey = new TextEncoder().encode(SECRET);
const jtiCache = createJtiCache({ ttlMs: JTI_TTL_MS });

const app = new Hono();

/**
 * GET /sso?token=<jwt>
 * Valida JWT, consome jti (anti-replay), seta cookie de sessão, redireciona pra /.
 */
app.get("/sso", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.text("Missing token", 400);

  const r = await verifySsoToken(token, SECRET);
  if (!r.ok) return c.text(`Invalid token: ${r.reason}`, 401);

  if (!jtiCache.tryConsume(r.session.jti)) {
    return c.text("Token already used", 401);
  }

  const sessionJwt = await new SignJWT({
    email: r.session.email,
    name: r.session.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE_SEC}s`)
    .sign(secretKey);

  setCookie(c, COOKIE_NAME, sessionJwt, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SEC,
  });

  return c.redirect("/");
});

/**
 * GET /verify (uso interno — não usado nesta implementação,
 * deixado pra integração com forward_auth se mudar pra Caddy depois).
 */
app.get("/verify", async (c) => {
  const session = await readSession(c.req.header("cookie"));
  if (!session) return c.text("Unauthenticated", 401);
  c.header("X-Forwarded-Email", session.email);
  c.header("X-Forwarded-Name", session.name);
  return c.text("OK", 200);
});

/**
 * Catch-all: lê cookie, valida, strip+injeta headers, proxia pro UPSTREAM.
 */
app.all("*", async (c) => {
  const session = await readSession(c.req.header("cookie"));
  if (!session) {
    return c.text(
      "Sessão inválida ou expirada. Volte ao autron-dash e clique novamente em 'Chat IA'.",
      401,
    );
  }

  const upstreamUrl = new URL(c.req.url);
  const upstream = new URL(UPSTREAM);
  upstreamUrl.protocol = upstream.protocol;
  upstreamUrl.host = upstream.host;
  upstreamUrl.port = upstream.port;

  // Clona headers, faz strip dos X-Forwarded-* recebidos do cliente.
  const proxyHeaders = new Headers(c.req.raw.headers);
  for (const k of Array.from(proxyHeaders.keys())) {
    if (k.toLowerCase().startsWith("x-forwarded-")) proxyHeaders.delete(k);
  }
  proxyHeaders.set("X-Forwarded-Email", session.email);
  proxyHeaders.set("X-Forwarded-Name", session.name);
  proxyHeaders.set("host", upstream.host);

  const init: RequestInit = {
    method: c.req.method,
    headers: proxyHeaders,
    redirect: "manual",
  };
  if (!["GET", "HEAD"].includes(c.req.method)) {
    init.body = c.req.raw.body;
    // @ts-expect-error - Node fetch precisa de duplex pra streams
    init.duplex = "half";
  }

  const res = await fetch(upstreamUrl.toString(), init);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
});

async function readSession(
  cookieHeader: string | undefined,
): Promise<{ email: string; name: string } | null> {
  if (!cookieHeader) return null;
  const m = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`).exec(cookieHeader);
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], secretKey);
    if (typeof payload.email !== "string" || typeof payload.name !== "string") return null;
    return { email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

serve({ fetch: app.fetch, port: PORT });
console.log(`autron-ia-sso-proxy ouvindo em :${PORT}, upstream ${UPSTREAM}`);
```

- [ ] **Step 2: Verificar que compila**

```bash
npm run build
```

Expected: sem erros; `dist/index.js` criado.

- [ ] **Step 3: Smoke test local (sem upstream real, espera erro de conexão)**

```bash
IA_SSO_SECRET="dev-secret-pelo-menos-32-bytes-pra-funcionar-abc" UPSTREAM_URL="http://localhost:9999" PORT=3001 timeout 3 node dist/index.js
```

Expected: imprime `autron-ia-sso-proxy ouvindo em :3001, upstream http://localhost:9999` e sobe (timeout de 3s mata).

- [ ] **Step 4: Commit + push**

```bash
git add src/index.ts
git commit -m "feat: servidor Hono com /sso, /verify e catch-all proxy com strip+inject de headers"
git push
```

### Task 4.8: Dockerfile

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Criar Dockerfile multi-stage**

```dockerfile
# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Stage 2: runner ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 hono
USER hono

EXPOSE 3001
ENV PORT=3001
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Build local (validação)**

```bash
docker build -t autron-ia-sso-proxy:test .
```

Expected: build conclui sem erros.

- [ ] **Step 3: Commit + push**

```bash
git add Dockerfile
git commit -m "build: Dockerfile multi-stage para deploy no Coolify"
git push
```

---

## Phase 5 — VPS IA: DNS e Coolify

### Task 5.1: Apontar DNS `ia.tudomudou.com.br` → `46.202.88.250`

**Files:** (operação no provedor de DNS — não tem arquivo no repo)

- [ ] **Step 1: Criar A record no provedor de DNS de `tudomudou.com.br`**

Adicione no painel do registrador:
- **Tipo:** A
- **Nome:** `ia` (resulta em `ia.tudomudou.com.br`)
- **Valor:** `46.202.88.250`
- **TTL:** 300 (5 min)

- [ ] **Step 2: Verificar propagação**

```bash
dig +short ia.tudomudou.com.br
```

Expected: `46.202.88.250`. (Se ainda não propagou, aguardar 5-30 min.)

### Task 5.2: Deploy Open WebUI no Coolify

**Files:** (configuração via UI do Coolify — `46.202.88.250:8000` ou o domínio do Coolify)

- [ ] **Step 1: Criar aplicação no Coolify**

Coolify UI → New Resource → Application → **Docker Image**:
- **Image:** `ghcr.io/open-webui/open-webui:main`
- **Name:** `open-webui`
- **Domain:** deixar em branco POR ENQUANTO (não vai ser exposto direto)
- **Port:** `8080` (porta interna)

- [ ] **Step 2: Adicionar volume persistente**

Mount: `/app/backend/data` → volume Coolify managed (nome: `open-webui-data`).

- [ ] **Step 3: Configurar env vars iniciais (provisório, sem trusted-header ainda)**

```
WEBUI_AUTH=true
ENABLE_SIGNUP=true
DEFAULT_USER_ROLE=admin
```

(`ENABLE_SIGNUP=true` temporariamente pra você criar a primeira conta admin e testar; vamos desabilitar depois.)

- [ ] **Step 4: Deploy e validar acesso**

Deploy. Aguardar startup (~30s).

Validar por dentro da VPS:
```bash
ssh root@46.202.88.250 'curl -sI http://localhost:<porta-mapeada>/auth | head -3'
```

Expected: HTTP 200 ou 302 (UI responde).

- [ ] **Step 5: Criar primeira conta admin**

Via UI temporária (Coolify pode te dar uma URL temporária ou expor por IP+porta). Cria conta com **seu email** — vira admin do Open WebUI.

- [ ] **Step 6: Anotar nome do container/rede**

No Coolify, ver o **nome interno** do container (algo como `open-webui-abc123`). Esse é o hostname acessível pela rede interna do Coolify pelos outros containers.

### Task 5.3: Deploy LiteLLM no Coolify com 3 keys

**Files:** (no Coolify)
- Config arquivo: `config.yaml` (montado como volume)

- [ ] **Step 1: Criar contas e gerar API keys**

- Anthropic: `https://console.anthropic.com` → API Keys → Create Key → anotar
- OpenAI: `https://platform.openai.com/api-keys` → Create new secret key → anotar
- Google Gemini: `https://aistudio.google.com/apikey` → Create API key → anotar

Cadastrar cartão da empresa em cada um. Setar budget alert (Anthropic e OpenAI têm; Google via Cloud Console).

- [ ] **Step 2: Criar `config.yaml` localmente pra colar no Coolify**

```yaml
model_list:
  - model_name: claude-sonnet-4-5
    litellm_params:
      model: anthropic/claude-sonnet-4-5
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: gpt-5
    litellm_params:
      model: openai/gpt-5
      api_key: os.environ/OPENAI_API_KEY

  - model_name: gemini-2.5-pro
    litellm_params:
      model: gemini/gemini-2.5-pro
      api_key: os.environ/GOOGLE_API_KEY

general_settings:
  master_key: sk-<gerar com openssl rand -hex 24>
```

Substituir `sk-<gerar...>` por uma string forte (`openssl rand -hex 24` → prefixar com `sk-`).

- [ ] **Step 3: Criar aplicação LiteLLM no Coolify**

- **Image:** `ghcr.io/berriai/litellm:main-latest`
- **Name:** `litellm`
- **Port:** `4000`
- **Domain:** vazio (rede interna apenas)

Mount o `config.yaml` em `/app/config.yaml` (criar via Coolify "Files" feature ou usar env mais simples).

- [ ] **Step 4: Env vars**

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-proj-...
GOOGLE_API_KEY=AIza...
LITELLM_MASTER_KEY=sk-<a-master-key-gerada>
```

Command: `--config /app/config.yaml --port 4000`

- [ ] **Step 5: Deploy e validar**

```bash
ssh root@46.202.88.250 'curl -s -X POST http://localhost:<litellm-port>/chat/completions \
  -H "Authorization: Bearer sk-<master-key>" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"claude-sonnet-4-5\",\"messages\":[{\"role\":\"user\",\"content\":\"diga oi em uma palavra\"}]}"'
```

Expected: resposta JSON com `choices[0].message.content` contendo "Oi" ou similar.

Repetir com `gpt-5` e `gemini-2.5-pro`.

### Task 5.4: Conectar Open WebUI → LiteLLM

**Files:** (env vars do container Open WebUI no Coolify)

- [ ] **Step 1: Adicionar env vars no Open WebUI**

```
OPENAI_API_BASE_URL=http://litellm:4000/v1
OPENAI_API_KEY=sk-<master-key-do-litellm>
```

(O nome `litellm` é o nome do container/serviço no Coolify; ajustar se diferente.)

- [ ] **Step 2: Reiniciar o container Open WebUI**

Via UI do Coolify.

- [ ] **Step 3: Validar na UI do Open WebUI**

Acesse a UI temporária (mesmo URL/IP+porta do Step 4 anterior). No dropdown de modelo, devem aparecer:
- `claude-sonnet-4-5`
- `gpt-5`
- `gemini-2.5-pro`

Mande "diga oi" pra cada um e confirme que respondem.

### Task 5.5: Deploy mini-proxy SSO no Coolify

**Files:** (configuração no Coolify)

- [ ] **Step 1: Gerar `IA_SSO_SECRET` forte**

```bash
openssl rand -base64 32
```

Anotar (vai ser usado em 2 lugares: aqui e no autron-dash).

- [ ] **Step 2: Criar aplicação no Coolify a partir do repo**

- **Source:** Public/Private GitHub repo → `jorguzz-fer/autron-ia-sso-proxy`
- **Branch:** `main`
- **Build pack:** Dockerfile (auto-detectado)
- **Name:** `ia-sso-proxy`
- **Port:** `3001`
- **Domain:** `ia.tudomudou.com.br` (com HTTPS via Let's Encrypt — Coolify gerencia automaticamente)

- [ ] **Step 3: Env vars**

```
IA_SSO_SECRET=<o-valor-gerado-no-step-1>
UPSTREAM_URL=http://open-webui:8080
PORT=3001
```

(Trocar `open-webui` pelo nome real do container do Open WebUI no Coolify, se diferente.)

- [ ] **Step 4: Deploy**

- [ ] **Step 5: Validar /sso retorna 400 sem token**

```bash
curl -sI https://ia.tudomudou.com.br/sso
```

Expected: `HTTP/2 400` com body `"Missing token"`.

### Task 5.6: Configurar Open WebUI para trusted-header auth (corte do acesso direto)

**Files:** (env vars do Open WebUI no Coolify)

- [ ] **Step 1: Adicionar env vars de trusted-header**

```
WEBUI_AUTH_TRUSTED_EMAIL_HEADER=X-Forwarded-Email
WEBUI_AUTH_TRUSTED_NAME_HEADER=X-Forwarded-Name
ENABLE_SIGNUP=false
```

(Manter `WEBUI_AUTH=true`. Não mexer no `DEFAULT_USER_ROLE` se já foi setado pra `user`; admin é manual.)

- [ ] **Step 2: REMOVER o domínio público temporário do Open WebUI**

Se você expôs o Open WebUI diretamente em algum subdomínio pra criar a conta admin (Step 5 da Task 5.2), AGORA REMOVA — o único acesso público deve ser via `ia.tudomudou.com.br` (mini-proxy). Mantenha apenas a rede interna do Coolify.

- [ ] **Step 3: Reiniciar Open WebUI**

- [ ] **Step 4: Validar que acesso direto agora exige trusted-header**

```bash
ssh root@46.202.88.250 'curl -sI http://localhost:<open-webui-porta>/'
```

Expected: redirect ou 401 (sem header X-Forwarded-Email, não autoriza).

### Task 5.7: Configurar envs `IA_SSO_SECRET` e `IA_CHAT_URL` no autron-dash (Coolify)

**Files:** (envs no painel Coolify do autron-dash)

- [ ] **Step 1: Adicionar envs no Coolify do autron-dash**

```
IA_SSO_SECRET=<MESMO-VALOR-da-Task-5.5-Step-1>
IA_CHAT_URL=https://ia.tudomudou.com.br
```

- [ ] **Step 2: Redeploy do autron-dash**

Via UI do Coolify (Restart ou Redeploy).

- [ ] **Step 3: Validar variáveis disponíveis**

Acessar `https://autron-dash.tudomudou.com.br/chat-ia` (já logado).

Expected: redirect 302 para `https://ia.tudomudou.com.br/sso?token=...` e em seguida pra `/` no Chat IA, já logado.

Se der erro "Chat IA não configurado", as envs não subiram — checar Coolify.

---

## Phase 6 — Validação end-to-end (critérios de §9 do spec)

### Task 6.1: Rodar a lista de 10 critérios

**Files:** (manual / browser + curl)

Para cada critério abaixo, marque ✅ quando passar. Se algum falhar, abrir nota inline e voltar à fase relevante.

- [ ] **C1.** `ia.tudomudou.com.br` responde HTTPS válido
  ```bash
  curl -sI https://ia.tudomudou.com.br/sso
  ```
  Expected: `HTTP/2 400` (sem token, mas TLS OK).

- [ ] **C2.** Acesso direto a `ia.tudomudou.com.br/` sem token → 401
  ```bash
  curl -sI https://ia.tudomudou.com.br/
  ```
  Expected: `HTTP/2 401` (sem cookie de sessão).

- [ ] **C3.** Click em "Chat IA" no sidebar do autron-dash (logado) → cai na UI do chat já logado, sem digitar senha.
  Browser: login autron-dash → sidebar → "Chat IA" → deve abrir a UI do Open WebUI no domínio `ia.tudomudou.com.br` já autenticado.

- [ ] **C4.** Reusar o mesmo `?token=…` 2x → segunda vez rejeitada.
  Browser DevTools: capturar URL após click no link (no Network, antes do redirect). Abrir em janela anônima — deve dar 401 "Token already used".

- [ ] **C5.** Acesso a `/chat-ia` no autron-dash sem sessão → redirect pra `/login`.
  Janela anônima: `https://autron-dash.tudomudou.com.br/chat-ia` → deve redirecionar pra `/login`.

- [ ] **C6.** Usuário desativado no autron-dash não consegue chegar no chat.
  Desativar um usuário de teste em `/admin/usuarios`. Logar como ele (não vai conseguir nem logar) — confirma que `/chat-ia` não emite token pra inativo.

- [ ] **C7.** Os 3 modelos (Claude, GPT, Gemini) aparecem no dropdown do Open WebUI e respondem.
  Na UI do Chat IA: dropdown → escolher `claude-sonnet-4-5` → mandar "diga oi"; repetir para `gpt-5` e `gemini-2.5-pro`.

- [ ] **C8.** Audit log `/admin/logs` mostra eventos `ia.chat.access`.
  Após clicar "Chat IA", abrir `/admin/logs` → deve ter linhas com `Ação = ia.chat.access` e `Entidade = IA`, o seu usuário e IP.

- [ ] **C9.** Header injection blocado.
  ```bash
  curl -sI -H "X-Forwarded-Email: hacker@evil.com" https://ia.tudomudou.com.br/
  ```
  Expected: `401`. O proxy faz strip + reset; sem cookie válido, sessão não existe.

- [ ] **C10.** Budget alert configurado no Anthropic Console.
  Acessar `https://console.anthropic.com/settings/usage` → confirmar que existe alerta de orçamento configurado.

---

## Phase 7 — Documentação curta de uso

### Task 7.1: Escrever doc de onboarding pros funcionários

**Files:**
- Create: `autron-dash/docs/usuario/chat-ia.md` (1 página)

- [ ] **Step 1: Criar a doc**

```markdown
# Chat IA — Guia rápido

## Como acessar
1. Logue no autron-dash normalmente.
2. No sidebar, clique em **"Chat IA"** (ícone ✨).
3. Você cai direto na interface do chat, já logado.

## O que posso fazer
- Perguntar qualquer coisa de uso geral (redação, comparações, análises).
- Escolher entre **3 modelos** no dropdown:
  - **Claude Sonnet 4.5** — melhor pra análise e reconciliação de dados.
  - **GPT-5** — bom pra texto criativo e código.
  - **Gemini 2.5 Pro** — bom em português e contexto longo.
- Histórico fica salvo por usuário (você consegue voltar nas conversas).

## O que NÃO fazer
- ❌ Não colar dados pessoais de clientes ou funcionários sem necessidade.
- ❌ Não usar pra decisões automáticas que afetem clientes sem revisão humana.
- ✅ Tudo é auditado — fica registrado quem acessou e quando (não o conteúdo).

## Problemas?
- "Sessão inválida ou expirada" → volte ao autron-dash e clique de novo em **Chat IA**.
- Página não carrega → falar com TI.
```

- [ ] **Step 2: Commit + push**

```bash
cd /Users/fernandojorge/Desktop/Projetos/apps/autron-dash
mkdir -p docs/usuario
# colar conteúdo no arquivo
git add docs/usuario/chat-ia.md
git commit -m "docs: guia rapido do Chat IA pros funcionarios"
git push
```

---

## Notas finais

**Total estimado:** 1.5–2 dias de trabalho efetivo, espalhado em 7 fases.

**Sequência crítica:** Fases 0–3 (autron-dash) podem ser feitas em paralelo com Fase 4 (proxy). A Fase 5 (deploy VPS) só pode rodar quando 4 estiver pronta. A Fase 6 (validação) só faz sentido quando 5 e 1-3 estiverem ambas no ar.

**Rollback:** se algo der errado, remover as envs `IA_SSO_SECRET`/`IA_CHAT_URL` do autron-dash faz a rota `/chat-ia` dar erro 500 (mensagem amigável), e o sidebar mostra o link mas ele não funciona. Tirar o link via revert do commit da Task 3.1.

**Operações pós-entrega:**
- Rotação anual de `IA_SSO_SECRET` (atualizar em 2 lugares: autron-dash e ia-sso-proxy).
- Revisar uso/custo das APIs mensalmente nos consoles dos provedores.
- Monitorar `/admin/logs` filtrando `action=ia.chat.access` pra ver adoção.
