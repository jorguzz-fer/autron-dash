# ia-sso-proxy

Mini-proxy SSO entre `autron-dash` (Next.js) e Open WebUI.

## O que faz

1. **`GET /sso?token=<jwt>`** — handshake do autron-dash:
   - Valida JWT HS256 com `IA_SSO_SECRET`
   - Anti-replay via `jti` em store in-memory (TTL 5min)
   - Seta cookie `ia_sso_session` (HMAC, HttpOnly, Secure, SameSite=Lax)
   - Redireciona pra `/` (Open WebUI)
2. **Catch-all** — reverse proxy pra Open WebUI:
   - **Strip** headers de identidade vindos do client (`X-Forwarded-Email/Name`, etc.) — segurança
   - **Inject** `X-Forwarded-Email` e `X-Forwarded-Name` a partir do cookie de sessão
   - Suporta **WebSocket** (necessário pro streaming de respostas LLM)
3. **`GET /healthz`** — JSON `{ok:true, jtiSize:N}` pra liveness/readiness probe.

Tudo em ~150 linhas TypeScript, sem framework — só `http-proxy` + `jose`.

## Env vars

| Variável | Obrigatória | Descrição |
|---|---|---|
| `IA_SSO_SECRET` | ✅ | Secret HS256 ≥ 32 chars. **Mesmo valor** definido no autron-dash (`openssl rand -base64 32`). |
| `OPEN_WEBUI_URL` | ✅ | URL interna do Open WebUI, ex: `http://open-webui:8080` (network do Docker). |
| `EXPECTED_ISSUER` | — | Issuer esperado no JWT. Default: `autron-dash`. |
| `PORT` | — | Porta HTTP do proxy. Default: `8080`. |
| `SESSION_TTL_HOURS` | — | TTL da sessão pós-handshake. Default: `8`. |

## Deploy no Coolify

1. **Novo app** → Source: GitHub `jorguzz-fer/autron-dash`, branch `main`
2. **Build context (Base Directory)**: `services/ia-sso-proxy`
3. **Dockerfile location**: `services/ia-sso-proxy/Dockerfile`
4. **Domain**: `ia.tudomudou.com.br` (HTTPS via Let's Encrypt automático no Coolify)
5. **Env vars** (painel do Coolify):
   ```
   IA_SSO_SECRET=<MESMO secret do autron-dash>
   OPEN_WEBUI_URL=http://open-webui:8080
   ```
   *(troca `open-webui` pelo nome do serviço do Open WebUI na rede Docker do mesmo Coolify)*
6. **Port mapping**: 8080 (Coolify cuida do TLS na frente)

> ⚠️ Open WebUI **NÃO** deve estar exposto publicamente. Apenas este proxy.

## Dev local

```bash
cd services/ia-sso-proxy
npm install
IA_SSO_SECRET=$(openssl rand -base64 32) \
OPEN_WEBUI_URL=http://localhost:3001 \
npm run dev
```

## Build

```bash
npm run build  # gera ./dist
npm start      # roda dist/server.js
```

## Healthcheck

```bash
curl https://ia.tudomudou.com.br/healthz
# {"ok":true,"jtiSize":0}
```

## Segurança

- `IA_SSO_SECRET` é compartilhado com autron-dash — rotação requer update nos 2 lugares simultaneamente.
- Anti-replay protege contra interceptação do JWT na URL (HTTPS + jti store).
- Cookie `ia_sso_session` é HttpOnly + Secure + SameSite=Lax — não acessível via JS, só via HTTPS.
- Headers `X-Forwarded-Email` (e companhia) vindos do cliente são **descartados** antes de chegar no Open WebUI — impede spoofing.
