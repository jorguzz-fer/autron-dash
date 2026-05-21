import {
  AcaoNecessaria,
  DisponibilidadeEstoque,
  StatusPedido,
  TipoProduto,
} from "./types";

/**
 * Árvore de decisão de "Ação Necessária" — replica regra do Streamlit
 * + refinamento "Item sem data confirmada" (item com SC/OP gerada mas
 * sem Dt. Confirma no follow-up; ação: cobrar prazo).
 *
 *   FINALIZADO                                            → 'Finalizado'
 *   é Serviço                                             → 'Prazo a confirmar'
 *   estoque SIM                                           → 'Estoque OK'
 *   é Comprando + tem OP (próprio ou na SC)               → 'ERRO no CADASTRO'
 *   é Comprando + tem SC + sem Dt. Confirma               → 'Item sem data confirmada'
 *   é Comprando + tem SC                                  → 'SC gerada - Aguardando'
 *   é Comprando + nada + SC manual identificada           → 'SC Manual'
 *   é Comprando + nada                                    → 'Necessario gerar SC'
 *   é Produzindo + tem OP + sem Dt. Confirma              → 'Item sem data confirmada'
 *   é Produzindo + tem OP                                 → 'OP gerada - Aguardando'
 *   é Produzindo + nada                                   → 'Necessario gerar OP'
 *   classificação Indefinido                              → 'Verificar classificacao'
 *
 * "SC Manual": existe um FollowUp cujo campo `pvInformadoSC` (Obs da SC)
 * contém o número do PV deste pedido — significa que o comprador gerou SC
 * manualmente sem vincular o número da SC ao pedido no Protheus.
 *
 * "Item sem data confirmada": SC ou OP já foi gerada mas o comprador/PCP
 * ainda não preencheu a Dt. Confirma no follow-up. Sem essa data ninguém
 * sabe quando o item efetivamente chega — precisa cobrar.
 */
export function acaoNecessaria(args: {
  status: StatusPedido;
  ehServico: boolean;
  disponibilidade: DisponibilidadeEstoque;
  tipoProduto: TipoProduto;
  temSC: boolean;
  temOP: boolean;
  temSCManual?: boolean;
  fuDtConfirma?: Date | null;
}): AcaoNecessaria {
  if (args.status === "FINALIZADO") return "Finalizado";
  if (args.ehServico) return "Prazo a confirmar";
  if (args.disponibilidade === "SIM") return "Estoque OK";

  if (args.tipoProduto === "Comprando") {
    if (args.temOP) return "ERRO no CADASTRO";
    if (args.temSC) {
      return args.fuDtConfirma ? "SC gerada - Aguardando" : "Item sem data confirmada";
    }
    if (args.temSCManual) return "SC Manual";
    return "Necessario gerar SC";
  }
  if (args.tipoProduto === "Produzindo") {
    if (args.temOP) {
      return args.fuDtConfirma ? "OP gerada - Aguardando" : "Item sem data confirmada";
    }
    return "Necessario gerar OP";
  }
  return "Verificar classificacao";
}
