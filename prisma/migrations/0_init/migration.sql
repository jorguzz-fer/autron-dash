-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DIRETOR', 'GERENTE', 'OPERADOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "Dataset" AS ENUM ('PEDIDO', 'FOLLOWUP', 'ESTOQUE', 'FATURAMENTO', 'CLASSIFICACAO');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PROCESSING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "hitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LGPDConsent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LGPDConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataUpload" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dataset" "Dataset" NOT NULL,
    "filename" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "status" "UploadStatus" NOT NULL DEFAULT 'PROCESSING',
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DataUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pedido" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numPedido" TEXT NOT NULL,
    "item" INTEGER NOT NULL,
    "produto" TEXT NOT NULL,
    "descricaoProduto" TEXT,
    "quantidade" INTEGER NOT NULL,
    "vlrTotal" DECIMAL(15,2),
    "margemPct" DECIMAL(8,4),
    "dtEmissao" TIMESTAMP(3),
    "dtOfertada" TIMESTAMP(3),
    "dtFatCli" TIMESTAMP(3),
    "notaFiscal" INTEGER,
    "numeroSC" TEXT,
    "itemSC" INTEGER,
    "numeroOP" TEXT,
    "itemOP" INTEGER,
    "pedCliente" TEXT,
    "nomeVendedor" TEXT,
    "unidadeNegocio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pedido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "noSC" TEXT NOT NULL,
    "numeroPV" TEXT,
    "codigoItem" TEXT,
    "pasta" TEXT,
    "dtConfirma" TIMESTAMP(3),
    "dtPreEntr" TIMESTAMP(3),
    "dtChegadaAutron" TIMESTAMP(3),
    "noPO" TEXT,
    "opNaSC" TEXT,
    "pvInformadoSC" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Estoque" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "saldoEstoque" DECIMAL(15,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Estoque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faturamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emissao" TIMESTAMP(3),
    "numDocto" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "descricaoProduto" TEXT,
    "quantidade" INTEGER NOT NULL,
    "vlrUnitario" DECIMAL(15,4),
    "vlrBruto" DECIMAL(15,2),
    "vlrIcms" DECIMAL(15,2),
    "vlrIpi" DECIMAL(15,2),
    "noPedido" TEXT,
    "itemPv" INTEGER,
    "faturamentoBruto" DECIMAL(15,2),
    "faturamentoLiquido" DECIMAL(15,2),
    "margemLiquidaR" DECIMAL(15,2),
    "margemLiquidaPct" DECIMAL(8,4),
    "nomeVendedor" TEXT,
    "razaoSocial" TEXT,
    "nomeFantasia" TEXT,
    "uf" TEXT,
    "tipoNegocio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Faturamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassificacaoProduto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "produto" TEXT NOT NULL,
    "tipoProduto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassificacaoProduto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "RateLimitHit_key_hitAt_idx" ON "RateLimitHit"("key", "hitAt");

-- CreateIndex
CREATE INDEX "LGPDConsent_userId_createdAt_idx" ON "LGPDConsent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "DataUpload_tenantId_dataset_startedAt_idx" ON "DataUpload"("tenantId", "dataset", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "DataUpload_fileHash_idx" ON "DataUpload"("fileHash");

-- CreateIndex
CREATE INDEX "Pedido_tenantId_dtEmissao_idx" ON "Pedido"("tenantId", "dtEmissao");

-- CreateIndex
CREATE INDEX "Pedido_tenantId_produto_idx" ON "Pedido"("tenantId", "produto");

-- CreateIndex
CREATE INDEX "Pedido_tenantId_numeroSC_idx" ON "Pedido"("tenantId", "numeroSC");

-- CreateIndex
CREATE INDEX "Pedido_tenantId_notaFiscal_idx" ON "Pedido"("tenantId", "notaFiscal");

-- CreateIndex
CREATE UNIQUE INDEX "Pedido_tenantId_numPedido_item_key" ON "Pedido"("tenantId", "numPedido", "item");

-- CreateIndex
CREATE INDEX "FollowUp_tenantId_noSC_idx" ON "FollowUp"("tenantId", "noSC");

-- CreateIndex
CREATE INDEX "FollowUp_tenantId_numeroPV_codigoItem_idx" ON "FollowUp"("tenantId", "numeroPV", "codigoItem");

-- CreateIndex
CREATE INDEX "FollowUp_tenantId_dtConfirma_idx" ON "FollowUp"("tenantId", "dtConfirma");

-- CreateIndex
CREATE INDEX "Estoque_tenantId_saldoEstoque_idx" ON "Estoque"("tenantId", "saldoEstoque");

-- CreateIndex
CREATE UNIQUE INDEX "Estoque_tenantId_codigo_key" ON "Estoque"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "Faturamento_tenantId_emissao_idx" ON "Faturamento"("tenantId", "emissao");

-- CreateIndex
CREATE INDEX "Faturamento_tenantId_noPedido_idx" ON "Faturamento"("tenantId", "noPedido");

-- CreateIndex
CREATE INDEX "Faturamento_tenantId_nomeVendedor_idx" ON "Faturamento"("tenantId", "nomeVendedor");

-- CreateIndex
CREATE UNIQUE INDEX "Faturamento_tenantId_numDocto_produto_itemPv_key" ON "Faturamento"("tenantId", "numDocto", "produto", "itemPv");

-- CreateIndex
CREATE INDEX "ClassificacaoProduto_tenantId_tipoProduto_idx" ON "ClassificacaoProduto"("tenantId", "tipoProduto");

-- CreateIndex
CREATE UNIQUE INDEX "ClassificacaoProduto_tenantId_produto_key" ON "ClassificacaoProduto"("tenantId", "produto");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataUpload" ADD CONSTRAINT "DataUpload_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataUpload" ADD CONSTRAINT "DataUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Estoque" ADD CONSTRAINT "Estoque_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Faturamento" ADD CONSTRAINT "Faturamento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassificacaoProduto" ADD CONSTRAINT "ClassificacaoProduto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

