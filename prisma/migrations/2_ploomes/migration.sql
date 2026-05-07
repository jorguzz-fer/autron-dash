-- AddNewEnumValue
ALTER TYPE "Dataset" ADD VALUE IF NOT EXISTS 'PLOOMES';

-- CreateTable
CREATE TABLE IF NOT EXISTS "PloomesOportunidade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ploomesId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "codigoCliente" TEXT,
    "cliente" TEXT,
    "responsavel" TEXT,
    "valor" DECIMAL(15,2),
    "termino" TIMESTAMP(3),
    "criacao" TIMESTAMP(3),
    "marcadores" TEXT,
    "cidadeCliente" TEXT,
    "ufCliente" TEXT,
    "emailContato" TEXT,
    "pedidoCompraCliente" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PloomesOportunidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PloomesOportunidade_tenantId_ploomesId_key" ON "PloomesOportunidade"("tenantId", "ploomesId");
CREATE INDEX IF NOT EXISTS "PloomesOportunidade_tenantId_termino_idx" ON "PloomesOportunidade"("tenantId", "termino");
CREATE INDEX IF NOT EXISTS "PloomesOportunidade_tenantId_pedidoCompraCliente_idx" ON "PloomesOportunidade"("tenantId", "pedidoCompraCliente");
CREATE INDEX IF NOT EXISTS "PloomesOportunidade_tenantId_responsavel_idx" ON "PloomesOportunidade"("tenantId", "responsavel");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PloomesOportunidade" ADD CONSTRAINT "PloomesOportunidade_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
