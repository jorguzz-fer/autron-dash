# Ambiente de Homologação — Autron Dash

Segunda instância do Dash no Coolify, **mesmo repositório**, branch e banco
separados. Serve para validar migrations, integrações novas (Sankhya) e
qualquer mudança arriscada sem chegar perto dos dados de produção.

```
                         ┌─ branch main    → app autron-dash          → banco autron_dash
repositório autron-dash ─┤
                         └─ branch homolog → app autron-dash-homolog  → banco autron_dash_homolog
```

Regra de ouro: **nada entra em `main` sem passar por `homolog`.** O fluxo de
uma mudança passa a ser `feature → homolog (testa) → main (produção)`.

> Por que não um repositório `v2` separado: duas bases de código divergem em
> semanas, todo bugfix precisa ser aplicado duas vezes e a fusão vira um
> projeto por si só. Uma branch dá a mesma segurança sem esse custo.

## 1. Banco de homologação

Coolify → **Resources → Databases → New → PostgreSQL**

- Nome: `autron-dash-homolog-db`
- Anote a `DATABASE_URL` gerada

Reusar a instância Postgres existente funciona, desde que seja um **banco
vazio dedicado** (`CREATE DATABASE autron_dash_homolog;`). O que não pode é
apontar para o banco de produção — as migrations e o seed escreveriam nos
dados reais.

## 2. Branch `homolog`

Criada a partir de `main`, e é dela que a app de homologação faz deploy:

```bash
git fetch origin
git checkout -b homolog origin/main
git push -u origin homolog
```

Para levar `main` para a homologação depois (ou o contrário), ver a seção
**Fluxo de trabalho**.

## 3. Aplicação no Coolify

**New Resource → Public Repository**

| Campo | Valor |
|-------|-------|
| Repo | `https://github.com/jorguzz-fer/autron-dash.git` |
| Branch | **`homolog`** ← única diferença estrutural para a app de produção |
| Build Pack | Dockerfile |
| Port | 3000 |

## 4. Variáveis de ambiente

```
# Banco — o de HOMOLOGAÇÃO (passo 1), nunca o de produção
DATABASE_URL=postgresql://USER:PASS@HOST:5432/autron_dash_homolog?schema=public

# Marca o ambiente: liga a faixa âmbar e o "[HOMOLOG]" na aba do navegador
APP_ENV=homolog

# Auth.js — secret PRÓPRIO, diferente do de produção (ver nota abaixo)
AUTH_SECRET=<openssl rand -base64 32>
AUTH_TRUST_HOST=true

# Tenant + admin inicial
SEED_ADMIN_EMAIL=fer.jorge@gmail.com
SEED_ADMIN_NAME=Fernando Jorge
SEED_ADMIN_PASSWORD=<senha forte, DIFERENTE da de produção>
SEED_TENANT_NAME=Autron
SEED_TENANT_SLUG=autron

MAX_UPLOAD_SIZE_MB=20
```

> **O `AUTH_SECRET` tem que ser diferente do de produção.** Ele é o que
> assina os JWTs de sessão: com o mesmo secret nos dois ambientes, um cookie
> emitido na homologação é aceito como sessão válida em produção.

As credenciais do Sankhya (`SANKHYA_*`) entram **aqui primeiro** — é o
propósito do ambiente. Só depois de validadas vão para produção.

## 5. Deploy e admin

Clique em **Deploy**. O `entrypoint.sh` aplica as migrations antes de subir o
servidor; os logs devem mostrar `Migrations OK` e depois `Starting server...`.

Crie o usuário admin pelo **Terminal** da app no Coolify:

```sh
node /app/scripts/seed-admin.js
```

A senha só é gravada quando o usuário é **criado**. Se ele já existir, trocar
o `SEED_ADMIN_PASSWORD` no painel e rodar o seed de novo **não** muda a senha
(o script avisa) — para trocar de fato, e de quebra limpar o rate limit de
login:

```sh
node /app/scripts/seed-admin.js --reset-password
```

Confirme que a faixa âmbar e o selo "HOMOLOGAÇÃO · dados de teste" aparecem
na tela. Se não aparecerem, `APP_ENV` não chegou no container — corrija antes
de seguir, porque é o que impede confundir os dois ambientes.

## 6. Dados para testar

Um banco vazio testa migrations e login, mas não as telas. Duas opções:

**a) Subir as planilhas pela interface** — mais lento, e é exatamente o
fluxo que os usuários fazem. Bom para validar os parsers.

**b) Restaurar um dump da produção** — dá o cenário real:

```sh
# no servidor, com acesso aos dois bancos
pg_dump   "$DATABASE_URL_PROD"     -Fc -f /tmp/prod.dump
pg_restore "--dbname=$DATABASE_URL_HOMOLOG" --clean --if-exists /tmp/prod.dump
rm /tmp/prod.dump
```

Cuidados: o dump carrega os hashes de senha e os segredos MFA reais — trate o
arquivo como dado sensível e apague depois. Se o `MFA_ENCRYPTION_KEY` da
homologação for diferente do de produção, os segredos MFA restaurados não
decifram e os usuários precisam reconfigurar o autenticador **naquele
ambiente** (produção não é afetada).

## 7. Domínio (opcional)

Coolify → Settings da app → Domains → `homolog.dash.autron.com.br`. SSL
automático. Um subdomínio explícito ajuda a não confundir a URL.

## Fluxo de trabalho

```bash
# 1) desenvolve numa branch de feature (a partir de main)
git checkout -b feat/minha-mudanca origin/main

# 2) leva para homologação — o push dispara o deploy da app de homolog
git checkout homolog && git merge feat/minha-mudanca && git push origin homolog

# 3) testa na URL de homologação

# 4) aprovado: PR de feat/minha-mudanca para main (produção)
```

Merge de `feat/*` em `homolog` para testar, e o PR para `main` sai da branch
de feature — não de `homolog`. Assim `homolog` pode acumular experimentos que
nunca chegam em produção sem carregá-los junto no PR.

Se `homolog` divergir demais de produção, ela deixa de testar o que vai
subir. Periodicamente (ou depois de um merge grande em `main`):

```bash
git checkout homolog && git merge origin/main && git push origin homolog
```

## Checklist de verificação

Depois do primeiro deploy, confirme:

- [ ] Faixa âmbar no topo e selo "HOMOLOGAÇÃO" no canto inferior direito
- [ ] Aba do navegador mostra `[HOMOLOG] Autron Dash`
- [ ] `DATABASE_URL` aponta para o banco de homologação (**confira duas vezes**)
- [ ] `AUTH_SECRET` diferente do de produção
- [ ] Login funciona com o admin do seed
- [ ] Produção continua no ar e inalterada

## Custo

Um container (1 GB de RAM confortável) e o banco (~5 GB de disco). Se o
servidor estiver apertado, a homologação pode ficar desligada entre os usos —
ligue no Coolify quando for testar.
