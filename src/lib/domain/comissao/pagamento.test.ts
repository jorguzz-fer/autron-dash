// src/lib/domain/comissao/pagamento.test.ts
import { describe, it, expect } from "vitest";
import { janelaPagamento, gridPedidosPagos } from "./pagamento";
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
  it("agrupa comissão paga por janela x mês origem, proporcional ao rateio", () => {
    const lancs: LancamentoInput[] = [
      { numeroPedido: "P1", itemPedido: "A", dataEmissao: new Date(2026, 0, 10), valor: 10000, codVendedor: "V", dataPagamento: new Date(2026, 2, 24), parcela: 1, pctRateio: 100, classificacao: "PAGO" },
      // Não pago (FATURADO) — ignorado
      { numeroPedido: "P2", itemPedido: "A", dataEmissao: new Date(2026, 0, 12), valor: 5000, codVendedor: "V", dataPagamento: null, parcela: 1, pctRateio: 100, classificacao: "FATURADO" },
    ];
    const grid = gridPedidosPagos(lancs, 0.015);
    // P1: comissao 10000*0.015=150, rateio 100% -> 150 na janela 2026-04, origem jan(0)
    expect(grid.get("2026-04")?.[0]).toBeCloseTo(150, 6);
  });

  it("parcela paga libera proporção do rateio", () => {
    const lancs: LancamentoInput[] = [
      { numeroPedido: "P1", itemPedido: "A", dataEmissao: new Date(2026, 0, 10), valor: 30000, codVendedor: "V", dataPagamento: new Date(2026, 3, 22), parcela: 1, pctRateio: 33.33, classificacao: "PAGO" },
    ];
    const grid = gridPedidosPagos(lancs, 0.005);
    // comissao linha = 30000*0.005=150; * 33.33% = 49.995
    expect(grid.get("2026-05")?.[0]).toBeCloseTo(49.995, 3);
  });
});
