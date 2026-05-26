// src/lib/domain/comissao/comissao.ts
import type { LancamentoInput } from "./types";

/** Comissão de uma linha = valor * percentual do cargo. */
export function comissaoLinha(valor: number, comissaoPct: number): number {
  return valor * comissaoPct;
}

/**
 * Previsão de comissão por mês (returns array index 0=jan, length 12).
 * Soma a comissão (valor*pct) das linhas com dataEmissao no mês — mas só se
 * `habilita[mes-1]` for true. `habilita` vem da apuração (elegibilidade YTD).
 */
export function previsaoMensal(
  lancamentos: LancamentoInput[],
  comissaoPct: number,
  habilita: boolean[],
  ano: number,
): number[] {
  const prev = new Array<number>(12).fill(0);
  for (const l of lancamentos) {
    if (l.dataEmissao.getFullYear() !== ano) continue;
    const m = l.dataEmissao.getMonth();
    prev[m] += comissaoLinha(l.valor, comissaoPct);
  }
  return prev.map((v, i) => (habilita[i] ? v : 0));
}
