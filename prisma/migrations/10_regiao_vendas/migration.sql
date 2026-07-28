-- 10_regiao_vendas: Análise Regional de Vendas (carteiras por região).
-- Persiste apenas a CONFIGURAÇÃO do estudo:
--   RegiaoVenda        = território montado pelo usuário (UFs e/ou municípios)
--   ClienteGeoOverride = correção manual da geografia derivada por cliente
-- O faturamento (fato) e a cidade derivada NÃO são replicados aqui.

-- CreateTable
CREATE TABLE IF NOT EXISTS "RegiaoVenda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cor" TEXT,
    "vendedorCodigo" TEXT,
    "nomeVendedor" TEXT,
    "ufs" TEXT[] NOT NULL DEFAULT '{}',
    "municipios" TEXT[] NOT NULL DEFAULT '{}',
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegiaoVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClienteGeoOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteKey" TEXT NOT NULL,
    "clienteLabel" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "regiaoId" TEXT,
    "atualizadoPor" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteGeoOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RegiaoVenda_tenantId_nome_key" ON "RegiaoVenda"("tenantId", "nome");
CREATE INDEX IF NOT EXISTS "RegiaoVenda_tenantId_ativo_idx" ON "RegiaoVenda"("tenantId", "ativo");
CREATE UNIQUE INDEX IF NOT EXISTS "ClienteGeoOverride_tenantId_clienteKey_key" ON "ClienteGeoOverride"("tenantId", "clienteKey");
CREATE INDEX IF NOT EXISTS "ClienteGeoOverride_tenantId_idx" ON "ClienteGeoOverride"("tenantId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "RegiaoVenda" ADD CONSTRAINT "RegiaoVenda_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ClienteGeoOverride" ADD CONSTRAINT "ClienteGeoOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ClienteGeoOverride" ADD CONSTRAINT "ClienteGeoOverride_atualizadoPor_fkey" FOREIGN KEY ("atualizadoPor") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
