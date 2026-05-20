# Chat de IA Empresarial integrado ao autron-dash

**Status:** Design aprovado · pronto para plano de execução
**Data:** 2026-05-20
**Autor:** Fernando Jorge (+ assistente)
**Stack alvo:** Open WebUI (self-hosted) + Anthropic/OpenAI/Gemini APIs + SSO via trusted-header com autron-dash

---

## 1. Resumo executivo

Disponibilizar um chat de IA empresarial (estilo ChatGPT) para os funcionários da Autron, hospedado em VPS dedicada que a empresa já possui, integrado ao autron-dash via **SSO transparente** (reuso da autenticação Auth.js v5 existente). Os funcionários verão um link "Chat IA" no sidebar do dashboard e cairão direto na interface do chat já autenticados, sem digitar senha de novo.

A solução é off-the-shelf (Open WebUI mantido por comunidade ativa, sem código próprio de chat) + uma camada fina de SSO (~50 linhas de código de proxy) + ajustes mínimos no autron-dash (rota de emissão de JWT + link no sidebar).

Restrição corporativa atendida: nenhum funcionário acessa as interfaces consumer públicas (`chat.openai.com`, `claude.ai`, `gemini.google.com`); todo o tráfego passa por uma URL da empresa, com a chave de API empresarial sob controle do administrador, em modo "no training on data" (default das APIs comerciais).

---

## 2. Contexto e problema

### O que motivou

- Cliente quer que funcionários usem IA dentro do ambiente da empresa.
- Direção **não autoriza** uso das interfaces consumer abertas (preocupação com vazamento de dados / treino do modelo / falta de auditoria).
- Use case concreto que disparou a discussão: a usuária Daniele precisa, **esporadicamente**, comparar duas listas de notas fiscais (contábil × fiscal) para identificar divergências. Não justifica feature dedicada dentro do autron-dash, mas se beneficia de uma ferramenta geral de IA conversacional.
- Empresa tem uma VPS dedicada para esse projeto: Hostinger KVM 2 (8 GB RAM, 2 vCPU, 100 GB SSD, sem GPU), Ubuntu 24.04 + Coolify, IP `46.202.88.250`.

### O que NÃO é o problema

Originalmente discutimos "chat com os dados do dashboard" (NL Q&A sobre pedidos/faturamento/prontidão via tool calling). **Não é mais o escopo deste spec** — pode virar um spec próprio futuro (Fase 2 do roadmap abaixo). A demanda real é mais ampla: uma ferramenta de IA geral controlada pela empresa.

### Restrições conhecidas

- Hardware: 8 GB / 2 vCPU sem GPU → LLM local 100% **não viável** (modelos pequenos sem GPU entregam respostas em 1–3 minutos com qualidade fraca, especialmente para reconciliações com números).
- Política corporativa: nenhuma URL consumer pública; precisa de instância controlada pela empresa.
- Multi-tenant: autron-dash é multi-tenant; o chat de IA será uma **instância única da empresa Autron** (não multi-tenant — cada tenant que viesse a usar teria sua própria VPS+instância).
- Compliance: API comercial Anthropic/OpenAI/Gemini é aceitável (não usa dados para treino por default; auditável; retenção de 30 dias). Decisão da direção (a alinhar formalmente antes do deploy).

---

## 3. Decisões fechadas

| Decisão | Escolha |
|---|---|
| Caso de uso | Chat de IA geral empresarial (não "chat com os dados do dashboard") |
| Hardware | VPS dedicada já existente (8 GB / 2 vCPU, sem GPU) |
| Modelo LLM | Remoto via API comercial (não local) |
| Provedores | **Os 3 configurados**: Anthropic, OpenAI, Google Gemini — usuário escolhe modelo por chat |
| Chave de API | **Única, da empresa** (não BYO por usuário). Cadastrada no Open WebUI pelo admin |
| Interface | **Open WebUI** (`open-webui/open-webui`) — opção mais madura e popular, deploy via Coolify |
| Autenticação | **SSO trusted-header** — reuso do login do autron-dash (Nível 2 na taxonomia explorada) |
| Quem tem acesso | **Todos os usuários ativos** do autron-dash (sem restrição por role) |
| Persistência de histórico | Default do Open WebUI (banco local por usuário) — não exportamos pro autron-dash |
| Domínio | `ia.tudomudou.com.br` (sugerido; ajustável antes do deploy) |
| Fora de escopo agora | Tool calling com dados do autron-dash; upload de planilhas ad-hoc com IA; modelo local |

---

## 4. Arquitetura

### Diagrama lógico

```
┌────────────────────────────────────┐         ┌────────────────────────────────────┐
│  VPS autron-dash                   │         │  VPS dedicada IA (46.202.88.250)   │
│  autron-dash.tudomudou.com.br      │         │  ia.tudomudou.com.br               │
│                                    │         │                                    │
│  Next.js 15 + Prisma + Auth.js v5  │         │  Coolify                           │
│  ┌──────────────────────────────┐  │         │  ┌──────────────────────────────┐  │
│  │  Sidebar: "Chat IA"          │  │         │  │  Mini-proxy SSO              │  │
│  │  /chat-ia  (emite JWT)       │  │         │  │  (Caddy ou Hono)             │  │
│  │  /admin/logs (audit)         │  │         │  │  - valida JWT                │  │
│  │  IA_SSO_SECRET (env)         │  │         │  │  - strip X-Forwarded-*       │  │
│  │  IA_CHAT_URL (env)           │  │         │  │  - injeta trusted headers    │  │
│  └──────────────────────────────┘  │         │  │  IA_SSO_SECRET (env)         │  │
│                                    │         │  └────────────┬─────────────────┘  │
└────────────────────────────────────┘         │               │                    │
                  │                            │               ▼                    │
                  │ 1. click sidebar           │  ┌──────────────────────────────┐  │
                  │ 2. /chat-ia gera JWT       │  │  Open WebUI                  │  │
                  │ 3. 302 → ia.tudo...?token  │  │  - WEBUI_AUTH_TRUSTED_*      │  │
                  └────────────────────────────┼─→│  - histórico SQLite             │  │
                                               │  │  - aponta pro LiteLLM        │  │
                                               │  │    (compat OpenAI)           │  │
                                               │  └────────────┬─────────────────┘  │
                                               │               │                    │
                                               │               ▼                    │
                                               │  ┌──────────────────────────────┐  │
                                               │  │  LiteLLM (router multi-prov) │  │
                                               │  │  - config.yaml: 3 modelos    │  │
                                               │  │  - 3 keys empresariais       │  │
                                               │  └────────────┬─────────────────┘  │
                                               │               │                    │
                                               └───────────────┼────────────────────┘
                                                               │
                                                               ▼  (chamadas API)
                                            api.anthropic.com / platform.openai.com /
                                            generativelanguage.googleapis.com
```

### Fluxo de SSO (passo-a-passo)

1. Funcionário já logado em `autron-dash.tudomudou.com.br` clica em **"Chat IA"** no sidebar.
2. Browser faz `GET /chat-ia` no autron-dash.
3. Server Component `/chat-ia`:
   - Verifica `session = await auth()`. Se sem sessão → 302 → `/login`.
   - Gera JWT HS256 assinado com `IA_SSO_SECRET`:
     ```json
     {
       "email": "fernando@autron.com.br",
       "name": "Fernando Jorge",
       "userId": "cl…",
       "tenantId": "autron",
       "exp": <now + 5min>,
       "jti": "<uuid v4>",
       "iss": "autron-dash"
     }
     ```
   - Chama `logAudit({ action: "ia.chat.access", entity: "IA", meta: { jti }, ip, userAgent })`.
   - Responde `302 Location: https://ia.tudomudou.com.br/sso?token=<jwt>`.
4. Browser segue o redirect → chega no **mini-proxy SSO** da VPS de IA.
5. Mini-proxy:
   - Valida `Bearer signature` do JWT com `IA_SSO_SECRET` (mesmo secret).
   - Valida `exp` (não pode estar expirado).
   - Valida `jti` em cache (in-memory ou Redis-leve, TTL 10min) — recusa se reusado (one-time-use).
   - **Strip** todos os headers `X-Forwarded-*` recebidos do cliente (defesa contra header injection).
   - **Injeta** `X-Forwarded-Email: fernando@autron.com.br` e `X-Forwarded-Name: Fernando Jorge`.
   - **Proxy reverso** para `http://localhost:8080` (porta interna do Open WebUI).
6. Open WebUI:
   - Configurado com `WEBUI_AUTH_TRUSTED_EMAIL_HEADER=X-Forwarded-Email` e `WEBUI_AUTH_TRUSTED_NAME_HEADER=X-Forwarded-Name`.
   - Primeira vez do usuário: cria conta automaticamente com esse email/nome.
   - Demais vezes: faz login e segue.
7. Usuário cai na interface de chat **já autenticado**. Sessão Open WebUI segue normal (cookies próprios), mas a credencial original veio do autron-dash.

### Subsistemas e responsabilidades

| Subsistema | Responsabilidade | Localização |
|---|---|---|
| Link "Chat IA" + rota `/chat-ia` | Emitir JWT de SSO, registrar audit | autron-dash (Next.js Server Component) |
| Mini-proxy SSO | Validar JWT, anti-replay (`jti`), strip+inject headers | VPS IA (Hono) |
| Open WebUI | Interface de chat, histórico, conexão com LiteLLM | VPS IA (container via Coolify) |
| LiteLLM | Router OpenAI-compat na frente de Anthropic + OpenAI + Gemini | VPS IA (container via Coolify, rede interna) |
| APIs LLM | Geração das respostas | externo (Anthropic/OpenAI/Google) |

Cada subsistema tem interface clara e pode ser entendido/testado isoladamente.

---

## 5. Componentes detalhados

### 5.1 No autron-dash (Next.js)

**Mudanças mínimas necessárias:**

- `src/components/Layout/Sidebar.tsx` — novo item de nav em uma seção apropriada (ex: nova seção "Assistente" ou final do `NAV_TOOLS`):
  ```tsx
  { label: "Chat IA", href: "/chat-ia", icon: Sparkles }
  ```
  Visível para todos os usuários logados (sem guard de role).

- `src/app/chat-ia/page.tsx` (novo Server Component):
  - `await auth()` → redirect `/login` se sem sessão.
  - Importa `signJwt` helper.
  - Gera JWT com payload definido em §4.
  - `await logAudit({ tenantId, userId, action: "ia.chat.access", entity: "IA", meta: { jti }, ip, userAgent })`.
  - `redirect(${process.env.IA_CHAT_URL}/sso?token=${jwt})`.

- `src/lib/iaSso.ts` (novo) — helper `signJwt(payload, secret)` usando `jose` (atualmente presente apenas como dependência transitiva do Auth.js v5; **adicionar como dep direta** em `package.json` para garantir compatibilidade — `npm install jose`).

- **Envs novas** (em Coolify do autron-dash):
  - `IA_SSO_SECRET` — string aleatória ≥32 bytes (`openssl rand -base64 32`)
  - `IA_CHAT_URL` — `https://ia.tudomudou.com.br`

- **Nenhuma migração de schema**. O `AuditLog` já suporta `action: "ia.chat.access"`.

### 5.2 Na VPS de IA (`46.202.88.250`)

**Stack:**

- **DNS**: A record `ia.tudomudou.com.br` → `46.202.88.250`.
- **Coolify** já está rodando — adicionar 2 aplicações:

#### a) Open WebUI

- Imagem: `ghcr.io/open-webui/open-webui:main` (ou versão pinada na hora do deploy)
- Porta interna: 8080
- Volume persistente: `/app/backend/data` (histórico, configs, banco SQLite default — ou Postgres se preferirmos)
- Variáveis:
  - `WEBUI_AUTH=true`
  - `ENABLE_SIGNUP=false` (impede auto-cadastro público — só entra via SSO)
  - `WEBUI_AUTH_TRUSTED_EMAIL_HEADER=X-Forwarded-Email`
  - `WEBUI_AUTH_TRUSTED_NAME_HEADER=X-Forwarded-Name`
  - `DEFAULT_USER_ROLE=user` (não admin; admin é manualmente promovido)
  - `OPENAI_API_BASE_URL=http://litellm:4000/v1` (aponta pro LiteLLM — ver §5.2.d)
  - `OPENAI_API_KEY=sk-litellm-master-key` (qualquer string aceita pelo LiteLLM)

- **NÃO exposto diretamente na internet** — só acessível através do mini-proxy.

#### d) LiteLLM (router multi-provider)

Open WebUI nativamente fala "OpenAI-compatible". Para servir Anthropic + OpenAI + Gemini sob a mesma UI sem depender de plugins comunitários, usamos **LiteLLM** como router OpenAI-compat na frente dos 3 provedores. É o padrão consolidado dessa stack.

- Imagem: `ghcr.io/berriai/litellm:main-latest`
- Porta interna: 4000
- Config `config.yaml`:
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
    master_key: sk-litellm-master-key  # qualquer string forte
  ```
- Variáveis: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY` (das contas empresariais).
- Não exposto publicamente — só rede interna entre containers.
- Open WebUI vê os 3 modelos como se fossem da OpenAI; usuário escolhe no dropdown.

**Por que LiteLLM e não plugins/functions do Open WebUI:**
- Configuração centralizada em YAML versionado, não na UI.
- Adicionar/remover provedores é editar 1 arquivo.
- Cobre fallback, budgets, logging de tokens nativos.
- Padrão amplamente usado e mantido (>15k stars, atualizações semanais).

#### b) Mini-proxy SSO

Duas opções de implementação (escolha no plano de execução):

**Opção (i): Caddy** (preferível pela simplicidade — sem código próprio)
- Caddyfile com `forward_auth` chamando um endpoint interno que valida o JWT, ou diretamente um plugin de JWT.
- Caddy nativamente suporta `Caddyfile` com headers manipulation.
- Risco: validação de JWT em Caddy puro requer um plugin externo (`caddy-jwt`) — verificar disponibilidade.

**Opção (ii): Hono mínimo (~80 linhas TypeScript)**
- Container Node.js Alpine + Hono + `jose`.
- Endpoint `GET /sso`: lê `?token=`, valida com `jose.jwtVerify`, valida `jti` em Map in-memory com TTL.
- Endpoint catch-all `*`: proxy reverso para `http://open-webui:8080` com headers injetados.
- Build em ~50 MB de imagem; consumo de memória ~30 MB.

Recomendação: **Hono** — controle total do strip+inject, dependências mínimas, código auditável.

- **Variável**: `IA_SSO_SECRET` (mesmo valor do autron-dash).
- Expor publicamente via Coolify (HTTPS via Let's Encrypt).

#### c) Roteamento de domínio

- `ia.tudomudou.com.br` → mini-proxy (porta 80/443) → Open WebUI (porta interna 8080).

---

## 6. Segurança

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| JWT vazado em logs/URL | Média | Alto se reusado | TTL 5min + `jti` one-time-use no proxy + audit log de cada emissão |
| Header injection (atacante seta `X-Forwarded-Email` direto) | Baixa (precisa acesso ao proxy) | Crítico se sucesso | Proxy faz **strip explícito** de todos `X-Forwarded-*` antes de injetar os controlados |
| Cliente atacante chama Open WebUI direto | Média | Crítico | Open WebUI **não exposto** publicamente — só `127.0.0.1:8080` na VPS, firewalled |
| Chave da API LLM vazada | Baixa | Alto (custo) | Armazenada em env do Coolify, nunca no Git, rotacionável |
| Conta de usuário desativada continua tendo acesso | Baixa | Alto | autron-dash não emite JWT pra inativo; sessão Open WebUI persiste mas usuário não consegue renovar |
| Custo de API explode | Média | Médio | Budget alert no Anthropic/OpenAI Console; Open WebUI suporta rate-limit por usuário |
| Conteúdo sensível em prompts (LGPD) | Média | Alto | Treinamento + documento de uso aceitável; histórico no Open WebUI tem botão de delete; possível ativar retenção limitada |

**Princípios reforçados:**

- `IA_SSO_SECRET` é compartilhado entre 2 sistemas — rotação requer atualização nos dois (documentar).
- Mini-proxy **sempre** strip de headers `X-Forwarded-*` ANTES de injetar os próprios.
- Comunicação interna proxy→Open WebUI via `localhost` ou rede interna Docker, nunca exposta.
- HTTPS obrigatório em `ia.tudomudou.com.br` (Coolify cuida via Let's Encrypt).

---

## 7. Auditoria e LGPD

### Auditoria no autron-dash
- Cada acesso ao chat gera um registro no `AuditLog`:
  ```ts
  { action: "ia.chat.access", entity: "IA", meta: { jti }, ip, userAgent }
  ```
- Visível na tela `/admin/logs` que acabamos de construir.
- Permite responder "quem usou o chat na última semana?".

### Auditoria no Open WebUI
- Open WebUI mantém histórico de conversas por usuário (banco interno).
- Admin do Open WebUI consegue listar usuários, ver volume de uso, exportar.
- **Não copiamos** essas conversas para o autron-dash (separação de concerns).

### LGPD
- Documentar em `/privacidade` da Autron (que já existe) uma seção curta sobre o chat de IA: dado processado, retenção, direito de exclusão.
- Funcionários têm acesso ao próprio histórico no Open WebUI e podem deletar.
- Política de uso: orientar usuários a **não** colar dados pessoais sensíveis sem necessidade.

---

## 8. Custos

### One-time
- VPS de IA: já paga até 2028-05-07. R$ 0.
- Domínio `ia.tudomudou.com.br`: já existe ou subdomínio gratuito.
- Tempo de desenvolvimento: ~1–1.5 dia (estimado em §10).

### Operacional (mensal)

| Cenário | Volume | Custo estimado |
|---|---|---|
| Esporádico (Daniele + ocasionais) | ~50 conversas/mês total | R$ 5–20 |
| Uso moderado | ~500 conversas/mês total | R$ 50–150 |
| Uso intensivo | ~5.000 conversas/mês | R$ 500–1.500 |

Premissa: conversa típica = 5 K input + 2 K output tokens em Claude Sonnet 4.5 (~US$ 0,03–0,15/conversa). Modelos mais baratos (Haiku, GPT-4o-mini, Gemini Flash) custam 5–10x menos — usuário escolhe.

**Controle:**
- Budget alert no Anthropic Console (ex: alerta em US$ 50/mês, hard limit em US$ 200).
- Rate-limit por usuário no Open WebUI (ex: 100 mensagens/dia/usuário) — configurável.

---

## 9. Critérios de sucesso

A entrega está completa quando:

1. ✅ `ia.tudomudou.com.br` responde HTTPS válido.
2. ✅ Acessar `ia.tudomudou.com.br` direto (sem token) → erro 401 ou redirect pra autron-dash.
3. ✅ Click em "Chat IA" no sidebar do autron-dash (usuário logado) → cai na UI do Open WebUI já logado, sem digitar senha.
4. ✅ Tentar reusar o mesmo `?token=…` 2x → segunda vez rejeitada (anti-replay).
5. ✅ Tentar acessar `/chat-ia` no autron-dash sem sessão → redirect pra `/login`.
6. ✅ Acesso de usuário desativado é bloqueado (autron-dash não emite JWT).
7. ✅ Os 3 provedores (Anthropic, OpenAI, Gemini) aparecem como opções de modelo dentro do Open WebUI e respondem.
8. ✅ Audit log `/admin/logs` mostra eventos `ia.chat.access`.
9. ✅ Atacante simulando `X-Forwarded-Email` no header da requisição é ignorado (strip do proxy funciona).
10. ✅ Budget alert no console do provedor está configurado.

---

## 10. Estimativa de esforço (para o plano de execução)

| Frente | Estimativa |
|---|---|
| DNS + SSL: apontar `ia.tudomudou.com.br` → VPS IA, cert via Coolify | 30min |
| Deploy Open WebUI no Coolify (imagem + volumes + envs) | 1h |
| Deploy LiteLLM (config.yaml + envs com 3 keys) | 1h |
| Criar contas Anthropic + OpenAI + Gemini, gerar keys empresariais | 1h |
| Implementar mini-proxy SSO (Hono + jose), dockerizar, deploy no Coolify | 3h |
| autron-dash: rota `/chat-ia`, helper `iaSso.ts`, link no sidebar, envs | 2h |
| Validação end-to-end (10 critérios de §9) | 1–2h |
| Documentação curta de uso (~1 página) | 30min |
| **Total** | **~1.5–2 dias** |

---

## 11. Roadmap

### Fase 1 — este spec
Open WebUI + SSO + link no autron-dash. Atende o pedido imediato (chat geral de IA controlado pela empresa).

### Fase 2 — futuro, se demanda crescer
Integrar dados do autron-dash via tool calling: ferramentas curadas (`getProntidaoResumo`, `getFaturamentoMensal`, etc.) que o LLM pode invocar para responder perguntas sobre os dados do dashboard. Vira spec próprio.

### Fase 3 — se necessário
Comparação ad-hoc de planilhas (caso original da Daniele) como tool dedicada do Fase 2. Pode também ser resolvido só com o chat puro (usuário cola as listas), tornando essa fase desnecessária.

---

## 12. Fora de escopo (explícito)

- ❌ Rodar LLM local na VPS (hardware insuficiente; decidido na exploração).
- ❌ Chat com os dados do autron-dash via tool calling (vira Fase 2).
- ❌ Upload de planilhas ad-hoc com UI específica (vira Fase 3 ou usa o chat puro).
- ❌ Multi-tenant no Open WebUI (esta instância é só da empresa Autron).
- ❌ BYO key por usuário (decidimos por chave única da empresa).
- ❌ Implementar OIDC provider no autron-dash (descartado por complexidade — SSO trusted-header resolve).
- ❌ Sincronização de usuários entre autron-dash e Open WebUI (criação automática via trusted header é suficiente).

---

## 13. Glossário

- **SSO** (Single Sign-On): autenticação única em múltiplos sistemas. Aqui implementado via trusted-header.
- **Trusted-header auth**: padrão onde a aplicação confia em um header HTTP setado por um proxy autenticado upstream. Suportado nativamente pelo Open WebUI.
- **JWT** (JSON Web Token): token assinado contendo claims (email, exp, jti). Aqui usado como credencial de curta duração para o handshake SSO.
- **jti**: JWT ID — claim padrão usado para detectar replay (one-time-use).
- **Pay-per-use API**: cobrança por tokens processados (input + output), sem mensalidade fixa. Aplica-se a Anthropic API, OpenAI API e Google Gemini API.
- **Open WebUI**: interface FOSS estilo ChatGPT, multi-modelo, self-hosted. https://github.com/open-webui/open-webui
