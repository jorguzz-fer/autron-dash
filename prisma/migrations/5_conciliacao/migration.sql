-- Conciliação Financeiro × Contábil (Demanda 1 da Controladoria)
-- Adiciona role CONTROLADORIA + 2 modelos + 2 enums.
-- Usa blocos de codigo PL/pgSQL pra separar AddValueToEnum + CreateType
-- (Postgres exige commit entre eles dentro da mesma transacao).

-- 1) Nova role
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CONTROLADORIA';

-- 2) Enums novos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConciliacaoStatus') THEN
    CREATE TYPE "ConciliacaoStatus" AS ENUM ('RASCUNHO', 'OK', 'DIVERGENTE');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DivergenciaLado') THEN
    CREATE TYPE "DivergenciaLado" AS ENUM ('SO_FINANCEIRO', 'SO_CONTABIL', 'DIVERGENTE');
  END IF;
END$$;

-- 3) Tabela Conciliacao
CREATE TABLE IF NOT EXISTS "Conciliacao" (
  "id"                  TEXT NOT NULL,
  "tenantId"            TEXT NOT NULL,
  "userId"              TEXT NOT NULL,
  "contaContabil"       TEXT NOT NULL,
  "descricaoConta"      TEXT,
  "dataReferencia"      TIMESTAMP(3) NOT NULL,
  "financeiroFileName"  TEXT NOT NULL,
  "financeiroBlob"      BYTEA NOT NULL,
  "contabilFileName"    TEXT NOT NULL,
  "contabilBlob"        BYTEA NOT NULL,
  "totalFinanceiro"     DECIMAL(15, 2) NOT NULL,
  "totalContabil"       DECIMAL(15, 2) NOT NULL,
  "diferencaTotal"      DECIMAL(15, 2) NOT NULL,
  "qtdDivergencias"     INTEGER NOT NULL,
  "observacoes"         TEXT,
  "status"              "ConciliacaoStatus" NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conciliacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Conciliacao_tenantId_dataReferencia_idx"
  ON "Conciliacao"("tenantId", "dataReferencia" DESC);
CREATE INDEX IF NOT EXISTS "Conciliacao_tenantId_contaContabil_idx"
  ON "Conciliacao"("tenantId", "contaContabil");
CREATE INDEX IF NOT EXISTS "Conciliacao_tenantId_status_idx"
  ON "Conciliacao"("tenantId", "status");

ALTER TABLE "Conciliacao"
  ADD CONSTRAINT "Conciliacao_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conciliacao"
  ADD CONSTRAINT "Conciliacao_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) Tabela ConciliacaoDivergencia
CREATE TABLE IF NOT EXISTS "ConciliacaoDivergencia" (
  "id"               TEXT NOT NULL,
  "conciliacaoId"    TEXT NOT NULL,
  "numeroNF"         TEXT NOT NULL,
  "codigoCliente"    TEXT,
  "nomeCliente"      TEXT,
  "lado"             "DivergenciaLado" NOT NULL,
  "saldoFinanceiro"  DECIMAL(15, 2),
  "saldoContabil"    DECIMAL(15, 2),
  "diferenca"        DECIMAL(15, 2),
  CONSTRAINT "ConciliacaoDivergencia_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConciliacaoDivergencia_conciliacaoId_lado_idx"
  ON "ConciliacaoDivergencia"("conciliacaoId", "lado");

ALTER TABLE "ConciliacaoDivergencia"
  ADD CONSTRAINT "ConciliacaoDivergencia_conciliacaoId_fkey"
  FOREIGN KEY ("conciliacaoId") REFERENCES "Conciliacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;
