-- KPI Financeiro — Títulos a Receber (FINR130 — Posição dos Títulos).
-- Snapshot atual da posição de títulos a receber do Protheus. Cada upload
-- substitui os dados anteriores (mesma estratégia dos demais datasets).

-- Novo valor no enum Dataset
ALTER TYPE "Dataset" ADD VALUE IF NOT EXISTS 'TITULO_RECEBER';

-- CreateTable
CREATE TABLE "TituloReceber" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "codigoCliente" TEXT,
  "loja" TEXT,
  "nomeCliente" TEXT,
  "numeroNF" TEXT NOT NULL,
  "parcela" TEXT,
  "tipo" TEXT,
  "natureza" TEXT,
  "dataEmissao" TIMESTAMP(3),
  "vencimento" TIMESTAMP(3),
  "valorOriginal" DECIMAL(15,2),
  "saldoVencido" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "saldoAVencer" DECIMAL(15,2) NOT NULL DEFAULT 0,
  "diasAtraso" INTEGER NOT NULL DEFAULT 0,
  "historico" TEXT,
  "dataReferencia" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TituloReceber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TituloReceber_tenantId_nomeCliente_idx" ON "TituloReceber"("tenantId", "nomeCliente");
CREATE INDEX "TituloReceber_tenantId_vencimento_idx" ON "TituloReceber"("tenantId", "vencimento");
CREATE INDEX "TituloReceber_tenantId_codigoCliente_idx" ON "TituloReceber"("tenantId", "codigoCliente");

-- AddForeignKey
ALTER TABLE "TituloReceber" ADD CONSTRAINT "TituloReceber_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
