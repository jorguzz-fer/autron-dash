-- Comissões Fase 2: carteira/hierarquia, garantido e % por linha.
-- Spec: docs/superpowers/specs/2026-06-18-comissoes-retomada-design.md

-- Hierarquia: gestor (supervisorCodigo referencia codigoProtheus, sem FK física).
ALTER TABLE "ComissaoVendedor" ADD COLUMN "supervisorCodigo" TEXT;

-- Garantido: piso mensal por N meses para recém-contratado.
ALTER TABLE "ComissaoVendedor" ADD COLUMN "garantidoValor" DECIMAL(15,2);
ALTER TABLE "ComissaoVendedor" ADD COLUMN "garantidoInicio" TIMESTAMP(3);
ALTER TABLE "ComissaoVendedor" ADD COLUMN "garantidoMeses" INTEGER;

CREATE INDEX "ComissaoVendedor_tenantId_supervisorCodigo_idx"
  ON "ComissaoVendedor"("tenantId", "supervisorCodigo");

-- Percentual de comissão por linha do Analítico ("Informe o Percentual" ÷ 100).
ALTER TABLE "ComissaoLancamento" ADD COLUMN "comissaoPct" DECIMAL(6,4);
