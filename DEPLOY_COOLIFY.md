# Deploy no Coolify — Autron Dash

Mesma receita validada na Funcional Farma. Stack: Next.js 15 standalone + Prisma 6 + Postgres + Auth.js v5.

## 1. Pré-requisitos no Coolify

- Servidor Coolify em pé (você já tem)
- Postgres disponível (pode reusar a instância da Funcional, **basta criar um banco separado**)
- DNS apontando pro Coolify (opcional, dá pra usar a URL gerada)

## 2. Criar o banco

No Coolify → **Resources → Databases → New → PostgreSQL** (ou conecte ao Postgres existente).

- Nome: `autron-dash-db`
- Anote a `DATABASE_URL` que o Coolify gera

> Atenção: se reusar Postgres compartilhado, **crie um banco vazio dedicado** (`CREATE DATABASE autron_dash;`). Reusar o mesmo schema da Funcional pode causar conflito de migrations e mistura de dados.

## 3. Criar a aplicação

**New Resource → Public Repository**

- Repo: `https://github.com/jorguzz-fer/autron-dash.git`
- Branch: `main`
- Build Pack: **Dockerfile**
- Port: **3000**

## 4. Variáveis de ambiente

Cole no painel **Environment Variables** do Coolify:

```
# Banco
DATABASE_URL=postgresql://USER:PASS@HOST:5432/autron_dash?schema=public

# Auth.js v5
AUTH_SECRET=<gere com: openssl rand -base64 32>
AUTH_TRUST_HOST=true

# Tenant + admin inicial (seed)
SEED_ADMIN_EMAIL=fer.jorge@gmail.com
SEED_ADMIN_NAME=Fernando Jorge
SEED_ADMIN_PASSWORD=<senha forte mínimo 10 chars, 3 classes>
SEED_TENANT_NAME=Autron
SEED_TENANT_SLUG=autron

# Upload de planilhas
MAX_UPLOAD_SIZE_MB=20
```

> Não defina `AUTH_URL` em produção — Auth.js v5 detecta sozinho via `AUTH_TRUST_HOST=true` + `Host` header.

## 5. Deploy

Clique em **Deploy**. Build leva ~2–3min na primeira vez.

O `entrypoint.sh` roda `scripts/run-migrations.js` antes do `server.js` — então o schema é aplicado automaticamente no primeiro boot. Os logs do Coolify devem mostrar:

```
Running database migrations...
apply 0_init
done  0_init (NN statements)
Migrations OK
Starting server...
   ▲ Next.js 15.x ready
```

## 6. Criar o usuário admin

Pelo **Terminal** do Coolify (no painel da aplicação → tab "Terminal"):

```sh
node /app/scripts/seed-admin.js
```

Saída esperada:
```
tenant: autron (xxxx)
admin: fer.jorge@gmail.com (xxxx)
```

Pronto — login na URL pública do Coolify com `fer.jorge@gmail.com` + a senha do `SEED_ADMIN_PASSWORD`.

## 7. Domínio personalizado (opcional)

No Coolify → **Settings** da app → **Domains** → adicione `dash.autron.com.br` (ou o que preferir). SSL é automático.

Após o domínio estar OK, mantenha `AUTH_TRUST_HOST=true` (não precisa setar `AUTH_URL`).

## 8. Atualizações futuras

- Cada `git push` no `main` dispara redeploy automático no Coolify (se webhook configurado)
- Migrations novas vão pra `prisma/migrations/<timestamp>_<nome>/migration.sql` e são aplicadas pelo `run-migrations.js` no próximo boot

## 9. Troubleshooting

| Sintoma | Causa | Fix |
|---------|-------|-----|
| Build falha em `prisma generate` | OOM no builder | Aumentar RAM no Coolify (1GB mínimo) |
| `Migration failed: relation already exists` | Banco já tinha tabelas | Drop banco e recriar, ou rodar `node /app/scripts/run-migrations.js --force` (apaga `_prisma_migrations`) |
| Login retorna 500 | Sem `AUTH_SECRET` | Setar var, redeploy |
| Upload retorna 413 | Arquivo > limite | Aumentar `MAX_UPLOAD_SIZE_MB` no env (e `client_max_body_size` no proxy se usar Nginx custom) |
| Healthcheck falha | Porta errada | Coolify port = `3000` (não 8080) |

## Recursos recomendados

- CPU: 1 core (parser de Excel é CPU-bound)
- RAM: 1 GB (mínimo) / 2 GB (confortável p/ planilhas grandes)
- Disco: 5 GB pra Postgres + logs

## Rotação periódica de AUTH_SECRET (security)

Recomendado **a cada 90 dias** ou imediatamente se houver suspeita de
comprometimento. A rotação invalida todos os JWTs ativos — todos os usuários
precisarão fazer login de novo, mas é a defesa mais forte contra session
hijacking persistente.

```bash
# 1) Gere um novo secret no seu Mac (NÃO no servidor — o terminal Coolify
#    pode loggar histórico)
openssl rand -base64 32

# 2) No painel Coolify → app autron-dash → Environment Variables
#    Atualize AUTH_SECRET com o novo valor

# 3) Redeploy (manual ou via push)
#    O Coolify recria o container com o novo secret

# 4) Avise os usuários que vão precisar logar de novo
```

**Não confunda com `SEED_ADMIN_PASSWORD`** — esse só é usado pelo `seed-admin.js`
no primeiro setup. Trocá-lo no env não muda a senha do admin no banco.
Para alterar a senha do admin, use o terminal Coolify:

```sh
node -e "
const{PrismaClient}=require('@prisma/client');
const bcrypt=require('bcryptjs');
const p=new PrismaClient();
(async()=>{
  const senha='NOVA_SENHA_FORTE';  // edite (10+ chars, 3 classes)
  const hash=await bcrypt.hash(senha,12);
  await p.user.updateMany({where:{email:'fer.jorge@gmail.com'},data:{passwordHash:hash}});
  console.log('OK');
})().finally(()=>p.\$disconnect());
"
```

## Cuidados de segurança operacional

- **Nunca** colocar secrets em ARGs do Dockerfile (o Coolify avisa
  `SecretsUsedInArgOrEnv` se houver) — secrets devem entrar via env vars do
  Coolify em runtime, não em build time.
- **Nunca** subir planilhas reais (`*.xlsx`, `*.csv`) pelo Git — o `.gitignore`
  bloqueia mas o GitHub Web UI não respeita gitignore. Se subir por engano,
  apague o histórico via `git filter-repo` (não basta `git rm`).
- Imagens Docker antigas se acumulam. Rode `docker system prune -af` no
  servidor mensalmente ou quando o disco passar de 70%.
- Audit log fica em `AuditLog` (table). Para review periódica:
  ```sql
  SELECT action, COUNT(*) FROM "AuditLog"
  WHERE "createdAt" > NOW() - INTERVAL '7 days'
  GROUP BY action ORDER BY COUNT(*) DESC;
  ```
