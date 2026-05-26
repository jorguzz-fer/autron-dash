// src/lib/domain/comissao/apuracao.ts
import type { LancamentoInput, MetaInput, RegraVendedor, ApuracaoAno, MesApuracao } from "./types";

/**
 * Apura o ano (12 meses) de um vendedor.
 * - EP do mês = soma do valor dos pedidos com dataEmissao no mês, deduplicando
 *   parcelas (mesma numeroPedido+itemPedido conta uma vez, valor do pedido).
 * - gatilho = meta * gatilhoPct; saldo = ep - meta.
 * - habilita (elegibilidade) = mensal: ep_m >= gatilho_m.
 *   gatilhoPct === 0 => sempre habilita.
 * - previsao fica 0 aqui; preenchida pela composição em getExtratoVendedor.
 */
export function apurarAno(
  lancamentos: LancamentoInput[],
  metas: MetaInput[],
  regra: RegraVendedor,
  ano: number,
): ApuracaoAno {
  // EP por mês com dedup de parcela (numeroPedido|itemPedido)
  const epPorMes = new Array<number>(12).fill(0);
  const vistosPorMes: Array<Set<string>> = Array.from({ length: 12 }, () => new Set());
  for (const l of lancamentos) {
    if (l.dataEmissao.getFullYear() !== ano) continue;
    const m = l.dataEmissao.getMonth(); // 0-11
    const chave = `${l.numeroPedido}|${l.itemPedido ?? ""}`;
    if (vistosPorMes[m].has(chave)) continue;
    vistosPorMes[m].add(chave);
    epPorMes[m] += l.valor;
  }

  const metaPorMes = new Array<number>(12).fill(0);
  for (const meta of metas) {
    if (meta.ano !== ano) continue;
    if (meta.mes >= 1 && meta.mes <= 12) metaPorMes[meta.mes - 1] += meta.valorMeta;
  }

  const result: MesApuracao[] = [];
  let saldoAcum = 0;
  for (let i = 0; i < 12; i++) {
    const meta = metaPorMes[i];
    const ep = epPorMes[i];
    const gatilho = meta * regra.gatilhoPct;
    const saldo = ep - meta;
    saldoAcum += saldo;
    const habilita = regra.gatilhoPct === 0 ? true : ep >= gatilho;
    result.push({
      mes: i + 1,
      meta,
      gatilho,
      ep,
      saldo,
      saldoAcumulado: saldoAcum,
      habilita,
      previsao: 0,
    });
  }
  return result;
}
