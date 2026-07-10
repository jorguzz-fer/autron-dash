-- Inscrições Estaduais (IE) no enriquecimento de CNPJ.
-- Enriquecimento opcional via ReceitaWS CCC (Cadastro Centralizado de
-- Contribuinte): grava a lista de inscrições estaduais (todos os estados) e um
-- resumo textual. Habilitado por env (CNPJ_ENRICH_IE).

-- AlterTable
ALTER TABLE "EnrichmentRecord" ADD COLUMN "inscricoesEstaduais" JSONB;
ALTER TABLE "EnrichmentRecord" ADD COLUMN "ieResumo" TEXT;
