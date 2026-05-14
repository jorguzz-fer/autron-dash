-- AddColumn: dtEntrega em Pedido (coluna "Entrega" do relatório entrada pedido)
ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "dtEntrega" TIMESTAMP(3);
