-- Comissão % individual por vendedor.
-- Override opcional do % de comissão do cargo, definido por colaborador
-- (fração: 0.015 = 1,5%). Precedência no cálculo: % informado na linha do
-- analítico > comissaoOverride do vendedor > comissaoPct do cargo.

-- AlterTable
ALTER TABLE "ComissaoVendedor" ADD COLUMN "comissaoOverride" DECIMAL(6,4);
