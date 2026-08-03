# Deploy do Chat IA — passo a passo (Coolify VPS de IA)

Stack: **LiteLLM** (router) + **Open WebUI** (interface) + **ia-sso-proxy** (SSO).
Tudo num único `docker-compose.yml` em `services/`. Só o mini-proxy é exposto.

---

## Pré-requisitos (✅ já temos)

- VPS nova com Coolify rodando + server adicionado
- API keys: Anthropic, OpenAI, Google (Gemini)
- Mini-proxy SSO codado (`services/ia-sso-proxy/`)

---

## Fase 1 — DNS

No painel do registrador de `tudomudou.com.br`, criar 1 registro:

```
Tipo: A
Nome: ia
Valor: <IP-PÚBLICO-DA-VPS-DE-IA>
TTL: 3600 (ou automático)
```

Resultado: `ia.tudomudou.com.br` → VPS. Propaga em minutos. Confirme com:
```bash
dig +short ia.tudomudou.com.br
```

---

## Fase 2 — Criar o app Docker Compose no Coolify

1. No Coolify (VPS de IA) → **+ New Resource** → **Docker Compose**
2. **Source**: GitHub `jorguzz-fer/autron-dash`, branch `main`
3. **Base Directory**: `services`
4. **Docker Compose Location**: `docker-compose.yml` (ou `/services/docker-compose.yml`)
5. **Connect** / Save — o Coolify lê o compose e mostra os 3 serviços.

---

## Fase 3 — Variáveis de ambiente (no painel do Coolify, neste recurso)

Cole estas (valores reais — guarde em local seguro, NÃO commitar):

```
ANTHROPIC_API_KEY=<sua key Anthropic>
OPENAI_API_KEY=<sua key OpenAI>
GOOGLE_API_KEY=<sua key Google AI Studio>

# Chave interna LiteLLM ↔ Open WebUI (gere uma própria ou use esta):
LITELLM_MASTER_KEY=sk-7f5af10da5515122e113413a9d1a4d98

# Secret SSO — DEVE ser idêntico ao do autron-dash (Fase 5):
IA_SSO_SECRET=IFY+ztVfcg6JG7Lvi70vyiZEGIHzQlOsFn4IVfLH938=
```

> ⚠️ O `IA_SSO_SECRET` acima foi gerado agora. Use exatamente o mesmo valor
> aqui e no Coolify do autron-dash. Se preferir gerar outro:
> `openssl rand -base64 32` (≥ 32 chars).

---

## Fase 4 — Domínio no serviço ia-sso-proxy

No Coolify, dentro do recurso, no serviço **ia-sso-proxy**:
- **Domains**: `https://ia.tudomudou.com.br`
- **Port**: `8080`
- O Coolify cuida do HTTPS (Let's Encrypt) automaticamente.

Os serviços `litellm` e `open-webui` **NÃO** recebem domínio — ficam internos.

Clique **Deploy**. O Coolify builda o mini-proxy (Dockerfile) e puxa as imagens
do LiteLLM e Open WebUI.

### Smoke test da stack (antes de ligar o autron-dash)
```bash
curl https://ia.tudomudou.com.br/healthz
# → {"ok":true,"jtiSize":0}
```
Se responder, o mini-proxy está no ar. (Acessar `/` direto dá 401 — esperado,
só entra via SSO do autron-dash.)

---

## Fase 5 — Ligar o autron-dash

No Coolify do **autron-dash** (o app principal, outra VPS), adicionar 2 env vars:

```
IA_SSO_SECRET=IFY+ztVfcg6JG7Lvi70vyiZEGIHzQlOsFn4IVfLH938=
IA_CHAT_URL=https://ia.tudomudou.com.br
```

Redeploy do autron-dash. O link "Chat IA" reaparece na sidebar automaticamente
(some quando essas vars não existem).

---

## Fase 6 — Primeiro acesso + promover admin

1. No autron-dash logado → clicar **Chat IA** → deve abrir o Open WebUI já logado.
2. O primeiro usuário entra como `user`. Pra virar admin do Open WebUI (gerenciar
   modelos, ver todos os chats), promova via terminal do container:
   ```bash
   # No Coolify da VPS de IA → terminal do container open-webui:
   sqlite3 /app/backend/data/webui.db \
     "UPDATE user SET role='admin' WHERE email='SEU_EMAIL_AQUI';"
   ```
3. Teste: manda uma pergunta, troca de modelo no dropdown (Claude / GPT / Gemini).

---

## Ordem de troubleshooting

| Sintoma | Onde olhar |
|---------|-----------|
| `/healthz` não responde | Logs do `ia-sso-proxy` no Coolify. Env `IA_SSO_SECRET`/`OPEN_WEBUI_URL` setadas? |
| Chat IA redireciona mas dá 401 | `IA_SSO_SECRET` diferente entre autron-dash e mini-proxy |
| Open WebUI abre mas sem modelos | Logs do `litellm`. API keys corretas? Nomes de modelo no `litellm-config.yaml` batem com a conta? |
| "model not found" ao chatar | Ajustar `model:` no `litellm-config.yaml` pro ID exato disponível na conta |
| `RateLimitError ... account is not active / billing` | Conta do provider sem billing ativo (ex.: OpenAI pré-pago sem créditos). Corrija em platform.openai.com → Billing, ou troque a env `OPENAI_API_KEY` por uma conta ativa no Coolify + redeploy. Os `fallbacks` no config fazem o pedido cair pra outro provider enquanto isso. |
| Trocar a conta de um provider | É só editar a env var da chave (`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY`) no painel do Coolify e redeploy — não mexe no repositório. |
| Link "Chat IA" não aparece | `IA_SSO_SECRET` + `IA_CHAT_URL` setadas no autron-dash? Redeploy feito? |

---

## Modelos configurados (ajustáveis em `litellm-config.yaml`)

- **Claude**: Opus / Sonnet / Haiku
- **GPT**: GPT-5 / GPT-5 mini
- **Gemini**: 2.5 Pro / 2.5 Flash

Se um ID estiver desatualizado, edite `services/litellm-config.yaml`, commit, e
redeploy do recurso no Coolify.
