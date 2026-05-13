/**
 * Algoritmo de conciliação Financeiro × Contábil.
 *
 * Compara dois lados (extraídos do Protheus) por número de NF e identifica:
 *  - NFs presentes só no financeiro (título aberto sem lançamento contábil correspondente no período)
 *  - NFs presentes só no contábil (lançamento sem título — bug provável)
 *  - NFs em ambos com saldos divergentes
 *
 * Caveat importante: NFs criadas em meses ANTERIORES e ainda abertas em 31/X
 * NÃO têm débito no balancete do mês corrente (estão embutidas em saldoAnterior).
 * Por isso, "SO_FINANCEIRO" não é necessariamente erro — pode ser título velho
 * carregado. O usuário avalia caso a caso. A interface deve deixar isso claro.
 */

export type LadoDivergencia =
  | "SO_FINANCEIRO"
  | "SO_CONTABIL"
  | "DIVERGENTE"
  /**
   * NF aparece no financeiro com saldo aberto, mas no contábil só temos o
   * RECEBIMENTO (saldo negativo) — indica que a NF foi emitida em período
   * ANTERIOR ao coberto pelo balancete contábil. Não é divergência real;
   * o usuário deve alimentar o contábil com período maior pra ver o débito
   * original. Antes era classificado como DIVERGENTE (falso positivo com
   * diff = valor total da NF).
   */
  | "NF_ANTERIOR";

export interface TituloFinanceiroInput {
  numeroNF: string;
  codigoCliente: string | null;
  nomeCliente: string | null;
  saldoTotal: number;
}

export interface Divergencia {
  numeroNF: string;
  codigoCliente: string | null;
  nomeCliente: string | null;
  lado: LadoDivergencia;
  saldoFinanceiro: number | null;
  saldoContabil: number | null;
  /** financeiro − contábil. Null quando algum lado é null. */
  diferenca: number | null;
}

export interface ResultadoConciliacao {
  /** Soma dos saldoTotal de todos os títulos do relatório financeiro. */
  totalFinanceiro: number;
  /** Saldo final calculado da conta contábil (saldoAnterior + sum débitos − sum créditos). */
  totalContabil: number;
  /** Diferença = totalFinanceiro − totalContabil. Idealmente zero. */
  diferencaTotal: number;
  /** Lista de NFs com problema. NFs OK NÃO entram aqui. */
  divergencias: Divergencia[];
  /** Indica que totalFinanceiro casa com totalContabil (dentro da tolerância). */
  bateuTotalizador: boolean;
}

export interface ConciliarOpts {
  /** Tolerância em R$ pra considerar dois saldos "iguais". Default: 0.01 (1 centavo). */
  tolerancia?: number;
}

/**
 * Agrega múltiplos títulos da mesma NF (parcelas) somando o saldoTotal.
 * Preserva código/nome do primeiro título encontrado.
 */
function agregarFinanceiroPorNF(
  titulos: TituloFinanceiroInput[],
): Map<string, { saldo: number; codigo: string | null; nome: string | null }> {
  const out = new Map<string, { saldo: number; codigo: string | null; nome: string | null }>();
  for (const t of titulos) {
    if (!t.numeroNF) continue;
    const cur = out.get(t.numeroNF);
    if (cur) {
      cur.saldo += t.saldoTotal;
      // preserva codigo/nome existentes; se faltarem, complementa
      if (!cur.codigo && t.codigoCliente) cur.codigo = t.codigoCliente;
      if (!cur.nome && t.nomeCliente) cur.nome = t.nomeCliente;
    } else {
      out.set(t.numeroNF, {
        saldo: t.saldoTotal,
        codigo: t.codigoCliente,
        nome: t.nomeCliente,
      });
    }
  }
  return out;
}

/**
 * @param titulos Resultado do parser financeiro (já com saldos parseados).
 * @param saldosContabilPorNF Map<NF, saldo restante> do parser contábil.
 *   Saldo POSITIVO = NF criada e ainda não totalmente recebida no período.
 *   Saldo ZERO/NEGATIVO = NF totalmente recebida (ou pagamento de NF antiga).
 * @param totalFinanceiro Soma do saldoTotal de todos os títulos.
 * @param totalContabil Saldo final calculado da conta (saldoAnterior + débitos − créditos).
 */
export function conciliar(
  titulos: TituloFinanceiroInput[],
  saldosContabilPorNF: Map<string, number>,
  totalFinanceiro: number,
  totalContabil: number,
  opts: ConciliarOpts = {},
): ResultadoConciliacao {
  const tolerancia = opts.tolerancia ?? 0.01;
  const finPorNF = agregarFinanceiroPorNF(titulos);

  const divergencias: Divergencia[] = [];
  const nfsVistas = new Set<string>();

  // Passa 1: tudo que está no financeiro
  for (const [nf, dadosFin] of finPorNF.entries()) {
    nfsVistas.add(nf);
    const saldoCont = saldosContabilPorNF.get(nf);

    if (saldoCont === undefined) {
      // Só no financeiro — pode ser título de período anterior (não é erro garantido).
      divergencias.push({
        numeroNF: nf,
        codigoCliente: dadosFin.codigo,
        nomeCliente: dadosFin.nome,
        lado: "SO_FINANCEIRO",
        saldoFinanceiro: round2(dadosFin.saldo),
        saldoContabil: null,
        diferenca: null,
      });
      continue;
    }

    // Saldo contábil NEGATIVO + NF presente no financeiro = só recebimentos vistos,
    // a criação (débito) da NF foi em período anterior ao do balancete. Não é
    // divergência real — sinalizamos como NF_ANTERIOR com baixa prioridade.
    // Exemplo do caso: NF emitida em fev (R$ 81k), recebida parcialmente em mar
    // (R$ 40,5k → crédito no balancete de mar). Financeiro mostra R$ 40,5k aberto;
    // contábil de mar mostra -R$ 40,5k. Diff seria R$ 81k = exatamente o valor
    // da NF original (falso positivo de "DIVERGENTE").
    if (saldoCont < -tolerancia) {
      divergencias.push({
        numeroNF: nf,
        codigoCliente: dadosFin.codigo,
        nomeCliente: dadosFin.nome,
        lado: "NF_ANTERIOR",
        saldoFinanceiro: round2(dadosFin.saldo),
        saldoContabil: round2(saldoCont),
        diferenca: round2(dadosFin.saldo - saldoCont),
      });
      continue;
    }

    const dif = dadosFin.saldo - saldoCont;
    if (Math.abs(dif) > tolerancia) {
      divergencias.push({
        numeroNF: nf,
        codigoCliente: dadosFin.codigo,
        nomeCliente: dadosFin.nome,
        lado: "DIVERGENTE",
        saldoFinanceiro: round2(dadosFin.saldo),
        saldoContabil: round2(saldoCont),
        diferenca: round2(dif),
      });
    }
    // se bateu (dif <= tolerância) → NÃO entra na lista. É OK.
  }

  // Passa 2: tudo que está no contábil mas não estava no financeiro
  for (const [nf, saldoCont] of saldosContabilPorNF.entries()) {
    if (nfsVistas.has(nf)) continue;
    // NF tem movimentação no contábil (criação OU recebimento isolado) mas não
    // está no relatório financeiro. Cenários:
    //  - Saldo positivo: NF foi criada no período mas o título sumiu — possível
    //    bug de cadastro (cair na conta errada).
    //  - Saldo negativo: vimos só RECEBIMENTOS dessa NF no período (criação foi
    //    em mês anterior). Isso é esperado e NÃO é divergência real.
    //  - Saldo zero: NF criada E totalmente recebida no período (caso comum,
    //    não é divergência).
    if (Math.abs(saldoCont) <= tolerancia) continue;       // criada+recebida = OK
    if (saldoCont < 0) continue;                            // só recebimento = OK

    divergencias.push({
      numeroNF: nf,
      codigoCliente: null,
      nomeCliente: null,
      lado: "SO_CONTABIL",
      saldoFinanceiro: null,
      saldoContabil: round2(saldoCont),
      diferenca: null,
    });
  }

  // Ordena: piores primeiro (maior diferença absoluta), depois SO_CONTABIL,
  // SO_FINANCEIRO, e por fim NF_ANTERIOR (informativo, baixa prioridade).
  divergencias.sort((a, b) => {
    const ordemLado: Record<LadoDivergencia, number> = {
      DIVERGENTE: 0,
      SO_CONTABIL: 1,
      SO_FINANCEIRO: 2,
      NF_ANTERIOR: 3,
    };
    const ld = ordemLado[a.lado] - ordemLado[b.lado];
    if (ld !== 0) return ld;
    const aAbs = Math.abs(a.diferenca ?? a.saldoFinanceiro ?? a.saldoContabil ?? 0);
    const bAbs = Math.abs(b.diferenca ?? b.saldoFinanceiro ?? b.saldoContabil ?? 0);
    return bAbs - aAbs;
  });

  const diferencaTotal = round2(totalFinanceiro - totalContabil);
  const bateuTotalizador = Math.abs(diferencaTotal) <= tolerancia;

  return {
    totalFinanceiro: round2(totalFinanceiro),
    totalContabil: round2(totalContabil),
    diferencaTotal,
    divergencias,
    bateuTotalizador,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
