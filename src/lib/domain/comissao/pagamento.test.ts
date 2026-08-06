// src/lib/domain/comissao/pagamento.test.ts
import { describe, it, expect } from "vitest";
import { janelaPagamento, gridPedidosPagos, gridProgramados } from "./pagamento";
import type { LancamentoInput } from "./types";

describe("janelaPagamento", () => {
  it("dia <= 20 cai na janela que fecha no mês corrente", () => {
    // 19/03 -> janela 21/02-20/03 -> label do fechamento: 2026-03
    expect(janelaPagamento(new Date(2026, 2, 19))).toBe("2026-03");
  });
  it("dia >= 21 cai na janela que fecha no mês seguinte", () => {
    // 24/03 -> janela 21/03-20/04 -> label do fechamento: 2026-04
    expect(janelaPagamento(new Date(2026, 2, 24))).toBe("2026-04");
  });
  it("dia 20 ainda é do fechamento do mês corrente", () => {
    // 20/04 -> janela 21/03-20/04 -> 2026-04
    expect(janelaPagamento(new Date(2026, 3, 20))).toBe("2026-04");
  });
});

describe("gridPedidosPagos", () => {
  it("agrupa comissão paga por janela x mês origem", () => {
    const lancs: LancamentoInput[] = [
      { numeroPedido: "P1", itemPedido: "A", dataEmissao: new Date(2026, 0, 10), valor: 10000, codVendedor: "V", dataPagamento: new Date(2026, 2, 24), parcela: 1, pctRateio: 100, classificacao: "PAGO" },
      // Não pago (FATURADO) — ignorado
      { numeroPedido: "P2", itemPedido: "A", dataEmissao: new Date(2026, 0, 12), valor: 5000, codVendedor: "V", dataPagamento: null, parcela: 1, pctRateio: 100, classificacao: "FATURADO" },
    ];
    const grid = gridPedidosPagos(lancs, 0.015);
    // P1: comissao 10000*0.015=150 na janela 2026-04, origem jan(0)
    expect(grid.get("2026-04")?.[0]).toBeCloseTo(150, 6);
  });

  it("pctRateio não afeta o valor da comissão (comissão = valor * pct integralmente)", () => {
    const lancs: LancamentoInput[] = [
      { numeroPedido: "P1", itemPedido: "A", dataEmissao: new Date(2026, 0, 10), valor: 30000, codVendedor: "V", dataPagamento: new Date(2026, 3, 22), parcela: 1, pctRateio: 33.33, classificacao: "PAGO" },
    ];
    const grid = gridPedidosPagos(lancs, 0.005);
    // comissao = 30000*0.005 = 150 (pctRateio ignorado no cálculo)
    expect(grid.get("2026-05")?.[0]).toBeCloseTo(150, 3);
  });

  it("usa SEMPRE o % do cargo e IGNORA o comissaoPct por linha (regra ago/2026)", () => {
    const lancs: LancamentoInput[] = [
      // linha diz 100% (Protheus/rateio) — deve ser ignorada; vale o cargo 1,5%
      { numeroPedido: "P1", itemPedido: "A", dataEmissao: new Date(2026, 0, 10), valor: 10000, codVendedor: "V", dataPagamento: new Date(2026, 2, 24), parcela: 1, pctRateio: 100, classificacao: "PAGO", comissaoPct: 1 },
    ];
    const grid = gridPedidosPagos(lancs, 0.015);
    // 10000 * 0.015 = 150 (não 10000 * 1)
    expect(grid.get("2026-04")?.[0]).toBeCloseTo(150, 6);
  });

  it("pulo do gato: pedido emitido em mês NÃO habilitado nunca paga", () => {
    const lancs: LancamentoInput[] = [
      // emitido em ABR (índice 3), pago depois — mas ABR não habilitado
      { numeroPedido: "P1", itemPedido: "A", dataEmissao: new Date(2026, 3, 10), valor: 10000, codVendedor: "V", dataPagamento: new Date(2026, 5, 24), parcela: 1, pctRateio: 100, classificacao: "PAGO" },
    ];
    const habilita = new Array<boolean>(12).fill(true);
    habilita[3] = false; // ABR não habilitado
    const grid = gridPedidosPagos(lancs, 0.015, habilita);
    expect(grid.size).toBe(0); // descartado: emissão em mês não-habilitado
  });
});

describe("gridProgramados (faturado, aguardando pagamento)", () => {
  it("agrupa FATURADO pela janela do vencimento, por mês de origem", () => {
    const lancs: LancamentoInput[] = [
      { numeroPedido: "P1", itemPedido: "A", dataEmissao: new Date(2026, 0, 10), valor: 10000, codVendedor: "V", dataVencimento: new Date(2026, 2, 24), dataPagamento: null, parcela: 1, pctRateio: 100, classificacao: "FATURADO" },
      // PAGO não entra em programados
      { numeroPedido: "P2", itemPedido: "A", dataEmissao: new Date(2026, 0, 12), valor: 5000, codVendedor: "V", dataVencimento: new Date(2026, 2, 24), dataPagamento: new Date(2026, 2, 24), parcela: 1, pctRateio: 100, classificacao: "PAGO" },
    ];
    const grid = gridProgramados(lancs, 0.015);
    // venc 24/03 -> janela 2026-04, origem jan(0); comissão 10000*0.015=150
    expect(grid.get("2026-04")?.[0]).toBeCloseTo(150, 6);
    // só 1 janela (PAGO ignorado)
    expect(grid.size).toBe(1);
  });

  it("respeita o pulo do gato no programado", () => {
    const lancs: LancamentoInput[] = [
      { numeroPedido: "P1", itemPedido: "A", dataEmissao: new Date(2026, 3, 10), valor: 10000, codVendedor: "V", dataVencimento: new Date(2026, 5, 24), dataPagamento: null, parcela: 1, pctRateio: 100, classificacao: "FATURADO" },
    ];
    const habilita = new Array<boolean>(12).fill(true);
    habilita[3] = false;
    const grid = gridProgramados(lancs, 0.015, habilita);
    expect(grid.size).toBe(0);
  });
});
