import { PedidoInput, StatusPedido } from "./types";

/**
 * Status do pedido:
 *  - FINALIZADO se há nota fiscal emitida
 *  - EM ABERTO caso contrário
 */
export function statusPedido(p: Pick<PedidoInput, "notaFiscal">): StatusPedido {
  return p.notaFiscal != null ? "FINALIZADO" : "EM ABERTO";
}

/**
 * Detecta se o item é um SERVIÇO pela descrição.
 * Regex tolerante a variações: "serviço", "servico", "Serviço", "SERVICO".
 */
export function ehServico(descricao: string | null | undefined): boolean {
  if (!descricao) return false;
  return /serv[ií][cç]o/i.test(descricao);
}
