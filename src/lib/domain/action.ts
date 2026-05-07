import {
  AcaoNecessaria,
  DisponibilidadeEstoque,
  StatusPedido,
  TipoProduto,
} from "./types";

/**
 * Árvore de decisão de "Ação Necessária" — replica regra do Streamlit.
 *
 *   FINALIZADO                                            → 'Finalizado'
 *   é Serviço                                             → 'Prazo a confirmar'
 *   estoque SIM                                           → 'Estoque OK'
 *   é Comprando + tem OP (próprio ou na SC)               → 'ERRO no CADASTRO'
 *   é Comprando + tem SC                                  → 'SC gerada - Aguardando'
 *   é Comprando + nada                                    → 'Necessario gerar SC'
 *   é Produzindo + tem OP                                 → 'OP gerada - Aguardando'
 *   é Produzindo + nada                                   → 'Necessario gerar OP'
 *   classificação Indefinido                              → 'Verificar classificacao'
 */
export function acaoNecessaria(args: {
  status: StatusPedido;
  ehServico: boolean;
  disponibilidade: DisponibilidadeEstoque;
  tipoProduto: TipoProduto;
  temSC: boolean;
  temOP: boolean;
}): AcaoNecessaria {
  if (args.status === "FINALIZADO") return "Finalizado";
  if (args.ehServico) return "Prazo a confirmar";
  if (args.disponibilidade === "SIM") return "Estoque OK";

  if (args.tipoProduto === "Comprando") {
    if (args.temOP) return "ERRO no CADASTRO";
    if (args.temSC) return "SC gerada - Aguardando";
    return "Necessario gerar SC";
  }
  if (args.tipoProduto === "Produzindo") {
    if (args.temOP) return "OP gerada - Aguardando";
    return "Necessario gerar OP";
  }
  return "Verificar classificacao";
}
