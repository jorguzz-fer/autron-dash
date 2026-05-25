-- CreateTable
CREATE TABLE IF NOT EXISTS "ObservacaoPV" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numPedido" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "atualizadoPor" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservacaoPV_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ObservacaoPV_tenantId_numPedido_key" ON "ObservacaoPV"("tenantId", "numPedido");
CREATE INDEX IF NOT EXISTS "ObservacaoPV_tenantId_idx" ON "ObservacaoPV"("tenantId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ObservacaoPV" ADD CONSTRAINT "ObservacaoPV_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ObservacaoPV" ADD CONSTRAINT "ObservacaoPV_atualizadoPor_fkey" FOREIGN KEY ("atualizadoPor") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
