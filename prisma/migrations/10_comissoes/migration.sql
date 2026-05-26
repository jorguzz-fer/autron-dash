-- Enum de classificação de lançamento de comissão
CREATE TYPE "ComissaoClassificacao" AS ENUM ('PREVISTO', 'FATURADO', 'PAGO');

-- Novos valores no enum Dataset
ALTER TYPE "Dataset" ADD VALUE IF NOT EXISTS 'COMISSAO_ANALITICO';
ALTER TYPE "Dataset" ADD VALUE IF NOT EXISTS 'COMISSAO_META';

CREATE TABLE "ComissaoCargo" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "ano" INTEGER NOT NULL,
  "cargo" TEXT NOT NULL,
  "comissaoPct" DECIMAL(6,4) NOT NULL,
  "gatilhoPct" DECIMAL(6,4) NOT NULL,
  "base" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComissaoCargo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComissaoCargo_tenantId_ano_cargo_key" ON "ComissaoCargo"("tenantId", "ano", "cargo");

CREATE TABLE "ComissaoVendedor" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "codigoProtheus" TEXT NOT NULL,
  "nome" TEXT NOT NULL,
  "cargo" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "nivel" INTEGER,
  "gatilhoOverride" DECIMAL(6,4),
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComissaoVendedor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComissaoVendedor_tenantId_codigoProtheus_key" ON "ComissaoVendedor"("tenantId", "codigoProtheus");

CREATE TABLE "ComissaoLancamento" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "numeroPedido" TEXT NOT NULL,
  "itemPedido" TEXT,
  "dataEmissao" TIMESTAMP(3) NOT NULL,
  "codCliente" TEXT,
  "cliente" TEXT,
  "produto" TEXT,
  "quantidade" INTEGER,
  "valor" DECIMAL(15,2) NOT NULL,
  "codVendedor" TEXT NOT NULL,
  "tipoNegocio" TEXT,
  "dataEntrega" TIMESTAMP(3),
  "dataVencimento" TIMESTAMP(3),
  "dataPagamento" TIMESTAMP(3),
  "condicaoPagamento" TEXT,
  "parcela" INTEGER,
  "pctRateio" DECIMAL(8,4) NOT NULL,
  "classificacao" "ComissaoClassificacao" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComissaoLancamento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ComissaoLancamento_tenantId_codVendedor_dataEmissao_idx" ON "ComissaoLancamento"("tenantId", "codVendedor", "dataEmissao");
CREATE INDEX "ComissaoLancamento_tenantId_classificacao_idx" ON "ComissaoLancamento"("tenantId", "classificacao");
CREATE INDEX "ComissaoLancamento_tenantId_dataPagamento_idx" ON "ComissaoLancamento"("tenantId", "dataPagamento");

CREATE TABLE "ComissaoMeta" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "codVendedor" TEXT NOT NULL,
  "ano" INTEGER NOT NULL,
  "mes" INTEGER NOT NULL,
  "valorMeta" DECIMAL(15,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComissaoMeta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ComissaoMeta_tenantId_codVendedor_ano_mes_key" ON "ComissaoMeta"("tenantId", "codVendedor", "ano", "mes");

ALTER TABLE "ComissaoCargo" ADD CONSTRAINT "ComissaoCargo_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComissaoVendedor" ADD CONSTRAINT "ComissaoVendedor_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComissaoLancamento" ADD CONSTRAINT "ComissaoLancamento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComissaoMeta" ADD CONSTRAINT "ComissaoMeta_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
