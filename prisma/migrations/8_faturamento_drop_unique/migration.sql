-- DropIndex: Faturamento NAO e unico por (tenantId, numDocto, produto, itemPv).
-- A mesma NF tem o mesmo produto + item em varias linhas (filiais, lotes,
-- remessas parciais). O Streamlit trata como lista plana e soma tudo
-- (app.py:2089). O UNIQUE antigo forcava o parser a deduplicar, perdendo
-- ~R$ 5,9M de receita (320 colisoes reais) e quebrava o createMany no upload.
DROP INDEX IF EXISTS "Faturamento_tenantId_numDocto_produto_itemPv_key";

-- Indice nao-unico para lookups por NF (substitui o unique removido).
CREATE INDEX IF NOT EXISTS "Faturamento_tenantId_numDocto_idx" ON "Faturamento"("tenantId", "numDocto");
