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
 * (valor * comissaoPct do CARGO, sem aplicar pctRateio). Só linhas
 * classificacao === "PAGO" com dataPagamento.
 *
 * REGRA DE NEGÓCIO (ago/2026): usa SEMPRE o % do cargo/cadastro; o l.comissaoPct
 * por linha (Protheus) é ignorado. Ver previsaoMensal / types.ts.
 *
 * "Pulo do gato" (A9): pedido emitido em mês NÃO habilitado nunca paga, mesmo
 * que o cliente pague depois. Quando `habilitaPorMesEmissao` é fornecido, linhas
 * cujo mês de emissão não está habilitado são descartadas.
 */
export function gridPedidosPagos(
  lancamentos: LancamentoInput[],
  comissaoPct: number,
  habilitaPorMesEmissao?: boolean[],
): Map<string, number[]> {
  const grid = new Map<string, number[]>();
  for (const l of lancamentos) {
    if (l.classificacao !== "PAGO" || !l.dataPagamento) continue;
    const origem = l.dataEmissao.getMonth(); // 0-11
    if (habilitaPorMesEmissao && !habilitaPorMesEmissao[origem]) continue;
    const janela = janelaPagamento(l.dataPagamento);
    const valorPago = comissaoLinha(l.valor, comissaoPct);
    if (!grid.has(janela)) grid.set(janela, new Array<number>(12).fill(0));
    grid.get(janela)![origem] += valorPago;
  }
  return grid;
}

/**
 * Grid de comissão PROGRAMADA para pagar (N2 — pedido da reunião com Silvio):
 * pedidos FATURADOS, aguardando o cliente pagar. NÃO é o mesmo que pago.
 * Agrupa pela janela 21→20 da **data de vencimento** (previsão de quando deve
 * cair), por mês de ORIGEM (emissão). Respeita o pulo do gato (A9).
 * Quando não há vencimento, usa a própria emissão como referência.
 */
export function gridProgramados(
  lancamentos: LancamentoInput[],
  comissaoPct: number,
  habilitaPorMesEmissao?: boolean[],
): Map<string, number[]> {
  const grid = new Map<string, number[]>();
  for (const l of lancamentos) {
    if (l.classificacao !== "FATURADO") continue;
    const origem = l.dataEmissao.getMonth(); // 0-11
    if (habilitaPorMesEmissao && !habilitaPorMesEmissao[origem]) continue;
    const ref = l.dataVencimento ?? l.dataEmissao;
    const janela = janelaPagamento(ref);
    const valor = comissaoLinha(l.valor, comissaoPct);
    if (!grid.has(janela)) grid.set(janela, new Array<number>(12).fill(0));
    grid.get(janela)![origem] += valor;
  }
  return grid;
}
