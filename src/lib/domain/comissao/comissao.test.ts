// src/lib/domain/comissao/comissao.test.ts
import { describe, it, expect } from "vitest";
import { comissaoLinha, previsaoMensal } from "./comissao";
import type { LancamentoInput } from "./types";

function lanc(mes: number, valor: number, pedido: string): LancamentoInput {
  return {
    numeroPedido: pedido,
    itemPedido: "A",
    dataEmissao: new Date(2026, mes - 1, 10),
    valor,
    codVendedor: "000022",
    dataPagamento: null,
    parcela: null,
    pctRateio: 100,
    classificacao: "PREVISTO",
  };
}

describe("comissaoLinha", () => {
  it("comissao = valor * pct", () => {
    expect(comissaoLinha(13425.81, 0.01)).toBeCloseTo(134.2581, 4);
  });
});

describe("previsaoMensal", () => {
  it("soma comissao das linhas do mês quando habilitado", () => {
    const lancs = [lanc(1, 10000, "P1"), lanc(1, 5000, "P2"), lanc(2, 1000, "P3")];
    const habilita = [true, false, false, false, false, false, false, false, false, false, false, false];
    const prev = previsaoMensal(lancs, 0.015, habilita, 2026);
    expect(prev[0]).toBeCloseTo(225, 6); // (10000+5000)*0.015
    expect(prev[1]).toBe(0);             // fev não habilitado
  });

  it("usa SEMPRE o % do cargo e IGNORA o comissaoPct por linha (regra ago/2026)", () => {
    // Linha traz 100% (o que zerava o cálculo, virando valor bruto). Deve ser ignorado.
    const lancs: LancamentoInput[] = [
      { ...lanc(1, 10000, "P1"), comissaoPct: 1 },   // planilha diz 100%
      { ...lanc(1, 5000, "P2"), comissaoPct: 0.005 }, // planilha diz 0,5%
    ];
    const habilita = new Array<boolean>(12).fill(true);
    const prev = previsaoMensal(lancs, 0.015, habilita, 2026);
    // Cargo 1,5% aplicado a ambas: (10000+5000)*0.015 = 225 (não 15000+75)
    expect(prev[0]).toBeCloseTo(225, 6);
  });
});
