-- 17_carteira_cliente: Análise de Carteira.
-- Base ATUAL de donos de carteira (relatório Protheus "clientes com vendedor").
-- Permite reagrupar o histórico de faturamento e de entrada de pedidos pelo
-- dono atual do cliente, independentemente do vendedor da época.

-- AlterEnum
ALTER TYPE "Dataset" ADD VALUE IF NOT EXISTS 'CARTEIRA_CLIENTE';

-- CreateTable
CREATE TABLE IF NOT EXISTS "CarteiraCliente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chaveCadastro" TEXT NOT NULL,
    "codigoCliente" TEXT,
    "loja" TEXT,
    "cliente" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "clienteKey" TEXT NOT NULL,
    "fantasiaKey" TEXT,
    "cnpj" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "codVendedor" TEXT,
    "nomeVendedor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarteiraCliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CarteiraCliente_tenantId_chaveCadastro_key" ON "CarteiraCliente"("tenantId", "chaveCadastro");
CREATE INDEX IF NOT EXISTS "CarteiraCliente_tenantId_clienteKey_idx" ON "CarteiraCliente"("tenantId", "clienteKey");
CREATE INDEX IF NOT EXISTS "CarteiraCliente_tenantId_nomeVendedor_idx" ON "CarteiraCliente"("tenantId", "nomeVendedor");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "CarteiraCliente" ADD CONSTRAINT "CarteiraCliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
