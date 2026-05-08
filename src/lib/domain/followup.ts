import {
  FollowUpConsolidated,
  FollowUpInput,
  PedidoInput,
  PRAZO_A_DEFINIR,
} from "./types";

/**
 * Constrói índices de busca para follow-up:
 *  - por SC (mais autoritativo)
 *  - por (PV, item) (fallback)
 *
 * Quando há mais de uma linha de follow-up para a mesma chave, prioriza:
 *  1. com dtConfirma preenchido
 *  2. mais recente (maior dtConfirma ou dtPreEntr)
 */
export function buildFollowUpIndex(followUps: FollowUpInput[]): {
  bySC: Map<string, FollowUpInput>;
  byPVItem: Map<string, FollowUpInput>;
} {
  const bySC = new Map<string, FollowUpInput>();
  const byPVItem = new Map<string, FollowUpInput>();

  for (const fu of followUps) {
    if (fu.noSC) {
      const existing = bySC.get(fu.noSC);
      if (!existing || isMoreInformative(fu, existing)) bySC.set(fu.noSC, fu);
    }
    if (fu.numeroPV && fu.codigoItem) {
      const key = `${fu.numeroPV}|${fu.codigoItem}`;
      const existing = byPVItem.get(key);
      if (!existing || isMoreInformative(fu, existing)) byPVItem.set(key, fu);
    }
  }
  return { bySC, byPVItem };
}

function isMoreInformative(a: FollowUpInput, b: FollowUpInput): boolean {
  if (a.dtConfirma && !b.dtConfirma) return true;
  if (!a.dtConfirma && b.dtConfirma) return false;
  const aDate = a.dtConfirma?.getTime() ?? a.dtPreEntr?.getTime() ?? 0;
  const bDate = b.dtConfirma?.getTime() ?? b.dtPreEntr?.getTime() ?? 0;
  return aDate > bDate;
}

/**
 * Consolida follow-up para um pedido específico.
 *
 * Estratégia (combine_first do Streamlit):
 *  1. Tenta achar por SC (Pedido.numeroSC == FollowUp.noSC)
 *  2. Cai pra busca por (numPedido, produto)
 *  3. Combina com prioridade pra SC (não sobrescreve campos não-nulos)
 *
 * Exceção IND21+Posto/Cabine:
 *  Se unidadeNegocio = 'IND21' e descrição contém "posto" ou "cabine",
 *  prazoRealEntrega vira o marker 'A definir' (não tem prazo confirmado pelo cliente).
 */
export function consolidateFollowUp(
  pedido: PedidoInput,
  index: ReturnType<typeof buildFollowUpIndex>,
): FollowUpConsolidated {
  const fuSc = pedido.numeroSC ? index.bySC.get(pedido.numeroSC) ?? null : null;
  const fuPv = index.byPVItem.get(`${pedido.numPedido}|${pedido.produto}`) ?? null;

  // combine_first: SC tem prioridade; PV preenche campos nulos
  const fuDtConfirma = fuSc?.dtConfirma ?? fuPv?.dtConfirma ?? null;
  const fuDtPreEntr = fuSc?.dtPreEntr ?? fuPv?.dtPreEntr ?? null;
  const fuDtChegadaAutron = fuSc?.dtChegadaAutron ?? fuPv?.dtChegadaAutron ?? null;
  const fuPasta = fuSc?.pasta ?? fuPv?.pasta ?? null;
  const fuOpNaSC = fuSc?.opNaSC ?? fuPv?.opNaSC ?? null;

  // Exceção IND21 + Posto/Cabine
  const isInd21Special =
    pedido.unidadeNegocio === "IND21" &&
    !!pedido.descricaoProduto &&
    /posto|cabine/i.test(pedido.descricaoProduto);

  let prazoRealEntrega: FollowUpConsolidated["prazoRealEntrega"] = null;
  if (isInd21Special) {
    prazoRealEntrega = PRAZO_A_DEFINIR;
  } else {
    prazoRealEntrega = fuDtConfirma ?? fuDtPreEntr ?? null;
  }

  // semanaEntrega só faz sentido quando há confirmação
  const semanaEntrega = fuDtConfirma ? fuPasta : null;

  return {
    fuDtConfirma,
    fuDtPreEntr,
    fuDtChegadaAutron,
    fuPasta,
    fuOpNaSC,
    prazoRealEntrega,
    semanaEntrega,
  };
}
