-- Adiciona coluna `parcelas` em ConciliacaoDivergencia.
-- Guarda string agregada das parcelas conhecidas no financeiro pra cada NF
-- (ex: "1, 2, 3" ou "única"). Permite o usuário visualizar quais parcelas
-- estão sendo somadas e quais possivelmente estão faltando.
-- Pedido da Dai (Autron) na reunião 2026-05-21.
ALTER TABLE "ConciliacaoDivergencia" ADD COLUMN "parcelas" TEXT;
