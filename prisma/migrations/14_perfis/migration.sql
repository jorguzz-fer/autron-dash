-- 14_perfis: RBAC dinâmico (Perfil com módulos + capacidades).
--
-- Cria a tabela Perfil, semeia os 6 perfis de sistema por tenant espelhando o
-- comportamento atual de cada role (módulos visíveis + capacidades de ação) e
-- religa cada usuário ao perfil correspondente ao seu role. Nada muda de
-- comportamento no deploy: os perfis de sistema reproduzem exatamente as
-- permissões vigentes.

-- ── Tabela Perfil ───────────────────────────────────────────────────────────
CREATE TABLE "Perfil" (
  "id"           TEXT NOT NULL,
  "tenantId"     TEXT NOT NULL,
  "nome"         TEXT NOT NULL,
  "label"        TEXT NOT NULL,
  "descricao"    TEXT,
  "isSystem"     BOOLEAN NOT NULL DEFAULT false,
  "baseRole"     "Role" NOT NULL DEFAULT 'VIEWER',
  "modules"      TEXT[] NOT NULL DEFAULT '{}',
  "capabilities" TEXT[] NOT NULL DEFAULT '{}',
  "ativo"        BOOLEAN NOT NULL DEFAULT true,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Perfil_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Perfil_tenantId_nome_key" ON "Perfil"("tenantId", "nome");
CREATE INDEX "Perfil_tenantId_idx" ON "Perfil"("tenantId");

ALTER TABLE "Perfil" ADD CONSTRAINT "Perfil_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── User.perfilId ───────────────────────────────────────────────────────────
ALTER TABLE "User" ADD COLUMN "perfilId" TEXT;
CREATE INDEX "User_perfilId_idx" ON "User"("perfilId");
ALTER TABLE "User" ADD CONSTRAINT "User_perfilId_fkey"
  FOREIGN KEY ("perfilId") REFERENCES "Perfil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Seed dos 6 perfis de sistema por tenant ─────────────────────────────────
-- Módulos e capacidades espelham lib/pageAccess + lib/authz vigentes.

-- ADMIN: acesso total
INSERT INTO "Perfil" ("id","tenantId","nome","label","descricao","isSystem","baseRole","modules","capabilities","ativo","createdAt","updatedAt")
SELECT gen_random_uuid()::text, t.id, 'ADMIN', 'Administrador', 'Acesso total ao sistema', true, 'ADMIN',
  ARRAY['DASHBOARD','VISAO_GERAL','ENTRADA_PEDIDOS','ANALISE_CONTRATOS','PRONTIDAO','PREVISAO_ENTREGA','ESTOQUE','FATURAMENTO','PREVISAO_FATURAMENTO','COMPARATIVO_PLOOMES','UPLOADS','CHAT_IA','CONCILIACAO','KPI_FINANCEIRO','COMISSOES']::text[],
  ARRAY['MANAGE_USERS','UPLOAD_DATA','EDIT_PRONTIDAO','ACCESS_CONCILIACAO','ACCESS_KPI_FINANCEIRO','ACCESS_COMISSOES']::text[],
  true, now(), now()
FROM "Tenant" t;

-- DIRETOR (Gestão)
INSERT INTO "Perfil" ("id","tenantId","nome","label","descricao","isSystem","baseRole","modules","capabilities","ativo","createdAt","updatedAt")
SELECT gen_random_uuid()::text, t.id, 'DIRETOR', 'Gestão', 'Visão executiva e comissões', true, 'DIRETOR',
  ARRAY['DASHBOARD','VISAO_GERAL','ENTRADA_PEDIDOS','ANALISE_CONTRATOS','PRONTIDAO','PREVISAO_ENTREGA','ESTOQUE','FATURAMENTO','PREVISAO_FATURAMENTO','COMPARATIVO_PLOOMES']::text[],
  ARRAY['UPLOAD_DATA','EDIT_PRONTIDAO','ACCESS_COMISSOES']::text[],
  true, now(), now()
FROM "Tenant" t;

-- GERENTE (Supervisão)
INSERT INTO "Perfil" ("id","tenantId","nome","label","descricao","isSystem","baseRole","modules","capabilities","ativo","createdAt","updatedAt")
SELECT gen_random_uuid()::text, t.id, 'GERENTE', 'Supervisão', 'Operação com envio de planilhas', true, 'GERENTE',
  ARRAY['DASHBOARD','VISAO_GERAL','ENTRADA_PEDIDOS','ANALISE_CONTRATOS','PRONTIDAO','PREVISAO_ENTREGA','ESTOQUE','FATURAMENTO','PREVISAO_FATURAMENTO','COMPARATIVO_PLOOMES','UPLOADS']::text[],
  ARRAY['UPLOAD_DATA','EDIT_PRONTIDAO']::text[],
  true, now(), now()
FROM "Tenant" t;

-- OPERADOR
INSERT INTO "Perfil" ("id","tenantId","nome","label","descricao","isSystem","baseRole","modules","capabilities","ativo","createdAt","updatedAt")
SELECT gen_random_uuid()::text, t.id, 'OPERADOR', 'Operador', 'Entrada de dados e uploads', true, 'OPERADOR',
  ARRAY['DASHBOARD','VISAO_GERAL','ENTRADA_PEDIDOS','ANALISE_CONTRATOS','PRONTIDAO','PREVISAO_ENTREGA','ESTOQUE','FATURAMENTO','PREVISAO_FATURAMENTO','COMPARATIVO_PLOOMES','UPLOADS']::text[],
  ARRAY['UPLOAD_DATA']::text[],
  true, now(), now()
FROM "Tenant" t;

-- VIEWER (somente leitura)
INSERT INTO "Perfil" ("id","tenantId","nome","label","descricao","isSystem","baseRole","modules","capabilities","ativo","createdAt","updatedAt")
SELECT gen_random_uuid()::text, t.id, 'VIEWER', 'Visualizador', 'Somente leitura', true, 'VIEWER',
  ARRAY['DASHBOARD','VISAO_GERAL','ENTRADA_PEDIDOS','ANALISE_CONTRATOS','PRONTIDAO','PREVISAO_ENTREGA','ESTOQUE','FATURAMENTO','PREVISAO_FATURAMENTO','COMPARATIVO_PLOOMES']::text[],
  ARRAY[]::text[],
  true, now(), now()
FROM "Tenant" t;

-- CONTROLADORIA
INSERT INTO "Perfil" ("id","tenantId","nome","label","descricao","isSystem","baseRole","modules","capabilities","ativo","createdAt","updatedAt")
SELECT gen_random_uuid()::text, t.id, 'CONTROLADORIA', 'Controladoria', 'Conciliação, KPI financeiro e comissões', true, 'CONTROLADORIA',
  ARRAY['DASHBOARD','VISAO_GERAL','CONCILIACAO','KPI_FINANCEIRO']::text[],
  ARRAY['ACCESS_CONCILIACAO','ACCESS_KPI_FINANCEIRO','ACCESS_COMISSOES']::text[],
  true, now(), now()
FROM "Tenant" t;

-- ── Religa usuários ao perfil de sistema correspondente ao seu role ─────────
UPDATE "User" u
SET "perfilId" = p."id"
FROM "Perfil" p
WHERE p."tenantId" = u."tenantId"
  AND p."isSystem" = true
  AND p."nome" = u."role"::text;
