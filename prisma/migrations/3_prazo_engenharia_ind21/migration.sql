-- CreateTable
CREATE TABLE IF NOT EXISTS "PrazoEngenhariaIND21" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numPedido" TEXT NOT NULL,
    "dataPrazo" TIMESTAMP(3) NOT NULL,
    "observacao" TEXT,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrazoEngenhariaIND21_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PrazoEngenhariaIND21_tenantId_numPedido_criadoEm_idx" ON "PrazoEngenhariaIND21"("tenantId", "numPedido", "criadoEm" DESC);
CREATE INDEX IF NOT EXISTS "PrazoEngenhariaIND21_tenantId_criadoEm_idx" ON "PrazoEngenhariaIND21"("tenantId", "criadoEm");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "PrazoEngenhariaIND21" ADD CONSTRAINT "PrazoEngenhariaIND21_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PrazoEngenhariaIND21" ADD CONSTRAINT "PrazoEngenhariaIND21_criadoPor_fkey" FOREIGN KEY ("criadoPor") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
