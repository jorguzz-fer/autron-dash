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
 * Para chaves duplicadas, mantém a PRIMEIRA ocorrência — espelha `groupby(...).agg('first')`
 * do Streamlit antigo (app.py:340-352). Versões anteriores selecionavam a linha
 * "mais informativa" (mais recente, com dtConfirma), mas isso divergia da fonte
 * de verdade do cliente: ele espera ver a mesma linha que o Python escolheu.
 */
export function buildFollowUpIndex(followUps: FollowUpInput[]): {
  bySC: Map<string, FollowUpInput>;
  byPVItem: Map<string, FollowUpInput>;
} {
  const bySC = new Map<string, FollowUpInput>();
  const byPVItem = new Map<string, FollowUpInput>();

  for (const fu of followUps) {
    if (fu.noSC && !bySC.has(fu.noSC)) {
      bySC.set(fu.noSC, fu);
    }
    if (fu.numeroPV && fu.codigoItem) {
      const key = `${fu.numeroPV}|${fu.codigoItem}`;
      if (!byPVItem.has(key)) byPVItem.set(key, fu);
    }
  }
  return { bySC, byPVItem };
}

/**
 * Consolida follow-up para um pedido específico.
 *
 * Estratégia (combine_first do Streamlit):
 *  1. Tenta achar por SC (Pedido.numeroSC == FollowUp.noSC)
 *  2. Cai pra busca por (numPedido, produto)
 *  3. Combina com prioridade pra SC (não sobrescreve campos não-nulos)
 *
 * Exceção IND21+Posto/Cabine (app.py:424-426):
 *  Se unidadeNegocio = 'IND21' e descrição contém "posto" ou "cabine":
 *   - prazoRealEntrega vira o marker 'A definir'
 *   - fuDtConfirma e fuDtPreEntr são zerados (cliente não confirmou nada)
 *  Isso cascateia para Pronto_para_Fazer (cai pra "PARCIAL - Sem Follow-up" ou "NAO")
 *  e para Semana_Entrega (vira null, já que depende de fuDtConfirma).
 */
export function consolidateFollowUp(
  pedido: PedidoInput,
  index: ReturnType<typeof buildFollowUpIndex>,
): FollowUpConsolidated {
  const fuSc = pedido.numeroSC ? index.bySC.get(pedido.numeroSC) ?? null : null;
  const fuPv = index.byPVItem.get(`${pedido.numPedido}|${pedido.produto}`) ?? null;

  // combine_first: SC tem prioridade; PV preenche campos nulos
  let fuDtConfirma = fuSc?.dtConfirma ?? fuPv?.dtConfirma ?? null;
  let fuDtPreEntr = fuSc?.dtPreEntr ?? fuPv?.dtPreEntr ?? null;
  const fuDtChegadaAutron = fuSc?.dtChegadaAutron ?? fuPv?.dtChegadaAutron ?? null;
  const fuPasta = fuSc?.pasta ?? fuPv?.pasta ?? null;
  const fuOpNaSC = fuSc?.opNaSC ?? fuPv?.opNaSC ?? null;

  // Exceção IND21 + Posto/Cabine — zera datas do FU e marca prazo "A definir"
  const isInd21Special =
    pedido.unidadeNegocio === "IND21" &&
    !!pedido.descricaoProduto &&
    /posto|cabine/i.test(pedido.descricaoProduto);

  let prazoRealEntrega: FollowUpConsolidated["prazoRealEntrega"] = null;
  if (isInd21Special) {
    fuDtConfirma = null;
    fuDtPreEntr = null;
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
