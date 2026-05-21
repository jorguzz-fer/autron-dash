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
  /**
   * Número da parcela (ex: "1", "2", "3") ou null quando a NF é título único.
   * Cada linha do financeiro representa 1 parcela; várias linhas com a mesma NF
   * são parcelas distintas do mesmo título. O domínio agrega tudo por NF antes
   * de comparar com o contábil (somando saldos e juntando a lista de parcelas).
   */
  parcela: string | null;
  codigoCliente: string | null;
  nomeCliente: string | null;
  saldoTotal: number;
}

export interface Divergencia {
  numeroNF: string;
  /**
   * Lista descritiva das parcelas que o financeiro mostra dessa NF, ex:
   *   "1, 2, 3"      (3 parcelas conhecidas)
   *   "única"        (título não parcelado)
   *   null           (NF não está no financeiro — lado SO_CONTABIL)
   *
   * Útil pra a Daniele entender se o saldo divergente é porque faltam parcelas
   * no recebimento contábil ou se está tudo registrado.
   */
  parcelas: string | null;
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

interface AgregadoNF {
  saldo: number;
  codigo: string | null;
  nome: string | null;
  /** Set de parcelas vistas — só números (ou letras raras). Preserva ordem
   *  de inserção pra exibir na ordem que apareceu no relatório. */
  parcelas: Set<string>;
  /** Marca se ao menos 1 título da NF veio SEM parcela (= título único). */
  temSemParcela: boolean;
}

/**
 * Agrega múltiplos títulos da mesma NF (parcelas) somando o saldoTotal.
 * Preserva código/nome do primeiro título encontrado e coleta as parcelas
 * conhecidas pra exibição posterior.
 */
function agregarFinanceiroPorNF(titulos: TituloFinanceiroInput[]): Map<string, AgregadoNF> {
  const out = new Map<string, AgregadoNF>();
  for (const t of titulos) {
    if (!t.numeroNF) continue;
    const cur = out.get(t.numeroNF);
    const parcela = t.parcela?.trim() || null;
    if (cur) {
      cur.saldo += t.saldoTotal;
      // preserva codigo/nome existentes; se faltarem, complementa
      if (!cur.codigo && t.codigoCliente) cur.codigo = t.codigoCliente;
      if (!cur.nome && t.nomeCliente) cur.nome = t.nomeCliente;
      if (parcela) cur.parcelas.add(parcela);
      else cur.temSemParcela = true;
    } else {
      out.set(t.numeroNF, {
        saldo: t.saldoTotal,
        codigo: t.codigoCliente,
        nome: t.nomeCliente,
        parcelas: new Set(parcela ? [parcela] : []),
        temSemParcela: parcela == null,
      });
    }
  }
  return out;
}

/**
 * Formata as parcelas conhecidas de uma NF em string descritiva.
 *   - 0 parcelas + temSemParcela → "única"
 *   - N parcelas listadas        → "1, 2, 3"
 *   - 0 parcelas, sem flag       → null (impossível dado o algoritmo, mas defensivo)
 */
function formatParcelas(agg: AgregadoNF): string | null {
  if (agg.parcelas.size === 0) {
    return agg.temSemParcela ? "única" : null;
  }
  // Ordena numericamente quando possível, lexicograficamente em fallback.
  const lista = Array.from(agg.parcelas).sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  });
  return lista.join(", ");
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

    const parcelasStr = formatParcelas(dadosFin);

    if (saldoCont === undefined) {
      // Só no financeiro — pode ser título de período anterior (não é erro garantido).
      divergencias.push({
        numeroNF: nf,
        parcelas: parcelasStr,
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
        parcelas: parcelasStr,
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
        parcelas: parcelasStr,
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
      parcelas: null, // sem registro no financeiro → não temos info de parcelas
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
