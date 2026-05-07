-- AddNewEnumValues: Dataset
ALTER TYPE "Dataset" ADD VALUE IF NOT EXISTS 'META';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "MetaCategoria" AS ENUM ('ENTRADA_PEDIDO', 'RECEITA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable: Pedido — add contrato + cliente
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "contrato" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "cliente" TEXT;

-- CreateTable: Meta
CREATE TABLE IF NOT EXISTS "Meta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "categoria" "MetaCategoria" NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "valor" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Meta_tenantId_unidade_categoria_ano_mes_key" ON "Meta"("tenantId", "unidade", "categoria", "ano", "mes");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Meta_tenantId_ano_categoria_idx" ON "Meta"("tenantId", "ano", "categoria");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Meta" ADD CONSTRAINT "Meta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
