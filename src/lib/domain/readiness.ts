import {
  DisponibilidadeEstoque,
  ProntoParaFazer,
  StatusPedido,
} from "./types";

/**
 * Pronto para fazer? — combinação estoque + follow-up.
 *
 * Tabela de decisão:
 *   FINALIZADO                                       → 'FINALIZADO'
 *   serviço (disponibilidade='Servico')              → 'Servico'
 *   estoque SIM + follow-up confirmado               → 'SIM'
 *   estoque SIM (sem follow-up confirmado)           → 'PARCIAL - Sem Follow-up'
 *   follow-up confirmado (sem estoque suficiente)    → 'PARCIAL - Sem Estoque'
 *   nada disso                                       → 'NAO'
 */
export function prontoParaFazer(args: {
  status: StatusPedido;
  disponibilidade: DisponibilidadeEstoque;
  fuDtConfirma: Date | null;
}): ProntoParaFazer {
  if (args.status === "FINALIZADO") return "FINALIZADO";
  if (args.disponibilidade === "Servico") return "Servico";

  const temEstoqueOk = args.disponibilidade === "SIM";
  const temConfirmacao = args.fuDtConfirma != null;

  if (temEstoqueOk && temConfirmacao) return "SIM";
  if (temEstoqueOk && !temConfirmacao) return "PARCIAL - Sem Follow-up";
  if (!temEstoqueOk && temConfirmacao) return "PARCIAL - Sem Estoque";
  return "NAO";
}
