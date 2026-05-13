-- Adiciona valor NF_ANTERIOR ao enum DivergenciaLado.
-- Usado quando a NF aparece no financeiro mas o balancete contábil só tem
-- o RECEBIMENTO (saldo negativo) — significa que a NF foi emitida antes
-- do período do contábil. Antes era classificado como DIVERGENTE (falso
-- positivo, com diff = valor original da NF).
ALTER TYPE "DivergenciaLado" ADD VALUE 'NF_ANTERIOR';
