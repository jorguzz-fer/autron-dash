-- Enriquecimento de Base por CNPJ.
-- Importa planilhas de cadastros (nome + CNPJ) em lotes (EnrichmentBatch) e
-- enriquece cada CNPJ via fontes externas (Receita Federal / BrasilAPI/ReceitaWS),
-- gravando o resultado em EnrichmentRecord. O trabalho roda em background e é
-- retomável via lease (leaseOwner/leaseExpiresAt).

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "EnrichmentRecordStatus" AS ENUM ('PENDING', 'DONE', 'ERROR', 'SKIPPED');

-- CreateTable
CREATE TABLE "EnrichmentBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrichmentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrichmentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "origem" TEXT,
    "inputCodigo" TEXT,
    "inputLoja" TEXT,
    "inputName" TEXT,
    "inputNomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "tipoDoc" TEXT,
    "status" "EnrichmentRecordStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "situacao" TEXT,
    "cnaePrincipal" TEXT,
    "cnaeDescricao" TEXT,
    "cnaesSecundarios" JSONB,
    "capitalSocial" DECIMAL(18,2),
    "porte" TEXT,
    "matrizFilial" TEXT,
    "email" TEXT,
    "telefone1" TEXT,
    "telefone2" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "cep" TEXT,
    "socios" JSONB,
    "grauRisco" INTEGER,
    "cnaeSst" TEXT,
    "sesmtProvavel" BOOLEAN,
    "rhEstruturadoProvavel" BOOLEAN,
    "raw" JSONB,
    "enrichedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrichmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnrichmentBatch_tenantId_createdAt_idx" ON "EnrichmentBatch"("tenantId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EnrichmentBatch_status_leaseExpiresAt_idx" ON "EnrichmentBatch"("status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "EnrichmentRecord_batchId_status_idx" ON "EnrichmentRecord"("batchId", "status");

-- CreateIndex
CREATE INDEX "EnrichmentRecord_batchId_rowIndex_idx" ON "EnrichmentRecord"("batchId", "rowIndex");

-- CreateIndex
CREATE INDEX "EnrichmentRecord_tenantId_cnpj_idx" ON "EnrichmentRecord"("tenantId", "cnpj");

-- AddForeignKey
ALTER TABLE "EnrichmentBatch" ADD CONSTRAINT "EnrichmentBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentBatch" ADD CONSTRAINT "EnrichmentBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentRecord" ADD CONSTRAINT "EnrichmentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrichmentRecord" ADD CONSTRAINT "EnrichmentRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "EnrichmentBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

