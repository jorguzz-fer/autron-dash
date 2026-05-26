// src/lib/domain/comissao/pagamento.ts
import type { LancamentoInput } from "./types";
import { comissaoLinha } from "./comissao";

/**
 * Janela de pagamento 21->20. Retorna a chave "YYYY-MM" do MÊS DE FECHAMENTO
 * (o mês cujo dia 20 encerra a janela). Pagamento com dia<=20 fecha no próprio
 * mês; dia>=21 fecha no mês seguinte.
 */
export function janelaPagamento(d: Date): string {
  const ano = d.getFullYear();
  const mes = d.getMonth(); // 0-11
  // dia >= 21 -> fecha no mês seguinte; dia <= 20 -> fecha no mês corrente
  const fechamento = d.getDate() >= 21 ? mes + 1 : mes;
  const dt = new Date(ano, fechamento, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Grid de comissão PAGA: Map<janela "YYYY-MM", number[12]> onde o array é
 * indexado pelo mês de ORIGEM (emissão, 0=jan). Valor = comissaoLinha
 * (valor * comissaoPct, sem aplicar pctRateio). Só linhas classificacao === "PAGO"
 * com dataPagamento.
 */
export function gridPedidosPagos(
  lancamentos: LancamentoInput[],
  comissaoPct: number,
): Map<string, number[]> {
  const grid = new Map<string, number[]>();
  for (const l of lancamentos) {
    if (l.classificacao !== "PAGO" || !l.dataPagamento) continue;
    const janela = janelaPagamento(l.dataPagamento);
    const origem = l.dataEmissao.getMonth(); // 0-11
    const pct = l.comissaoPct ?? comissaoPct;
    const valorPago = comissaoLinha(l.valor, pct);
    if (!grid.has(janela)) grid.set(janela, new Array<number>(12).fill(0));
    grid.get(janela)![origem] += valorPago;
  }
  return grid;
}
