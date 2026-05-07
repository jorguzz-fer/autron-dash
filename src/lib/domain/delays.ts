import { PedidoInput, StatusPedido } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function diffDays(today: Date, target: Date): number {
  // Truncamos para meia-noite UTC para evitar "0.99 dias" virar "0".
  const a = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const b = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((a - b) / MS_PER_DAY);
}

/**
 * Dias de atraso vs data solicitada pelo cliente (DT. Fat. Cli).
 * Apenas calculado para pedidos EM ABERTO. Valor positivo = atrasado.
 */
export function diasAtrasoCliente(
  pedido: Pick<PedidoInput, "dtFatCli">,
  status: StatusPedido,
  today: Date,
): number | null {
  if (status !== "EM ABERTO") return null;
  if (!pedido.dtFatCli) return null;
  return diffDays(today, pedido.dtFatCli);
}

/**
 * Dias de atraso vs data ofertada (DT. Ofertada).
 * Apenas calculado para pedidos EM ABERTO.
 */
export function diasAtrasoOfertada(
  pedido: Pick<PedidoInput, "dtOfertada">,
  status: StatusPedido,
  today: Date,
): number | null {
  if (status !== "EM ABERTO") return null;
  if (!pedido.dtOfertada) return null;
  return diffDays(today, pedido.dtOfertada);
}
