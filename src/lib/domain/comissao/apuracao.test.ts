// src/lib/domain/comissao/apuracao.test.ts
import { describe, it, expect } from "vitest";
import { apurarAno } from "./apuracao";
import type { LancamentoInput, MetaInput, RegraVendedor } from "./types";

const VEND = "000022";
const regra: RegraVendedor = { comissaoPct: 0.015, gatilhoPct: 0.7 };

function meta(mes: number, valorMeta: number): MetaInput {
  return { codVendedor: VEND, ano: 2026, mes, valorMeta };
}
function lanc(mes: number, valor: number, pedido: string, item = "A", parcela: number | null = null, pctRateio = 100): LancamentoInput {
  return {
    numeroPedido: pedido,
    itemPedido: item,
    dataEmissao: new Date(2026, mes - 1, 10),
    valor,
    codVendedor: VEND,
    dataPagamento: null,
    parcela,
    pctRateio,
    classificacao: "PREVISTO",
  };
}

describe("apurarAno", () => {
  it("calcula EP somando pedidos do mês (deduplicando parcelas)", () => {
    // pedido 1 com 2 parcelas (mesmo pedido+item) deve contar uma vez
    const lancs = [
      lanc(1, 1000, "P1", "A", 1, 50),
      lanc(1, 1000, "P1", "A", 2, 50),
      lanc(1, 500, "P2", "A"),
    ];
    const ap = apurarAno(lancs, [meta(1, 1000)], regra, 2026);
    expect(ap[0].ep).toBe(1500); // 1000 (P1, uma vez) + 500 (P2)
  });

  it("gatilho = meta * gatilhoPct e saldo = ep - meta", () => {
    const ap = apurarAno([lanc(1, 1200, "P1")], [meta(1, 1000)], regra, 2026);
    expect(ap[0].gatilho).toBeCloseTo(700);
    expect(ap[0].saldo).toBe(200);
  });

  it("elegibilidade acumulada YTD: mês forte compensa mês fraco", () => {
    // JAN EP 2000 (meta 1000, gatilho 700) -> YTD EP 2000 >= YTD gatilho 700 -> habilita
    // FEV EP 100 (meta 1000, gatilho 700) -> YTD EP 2100 >= YTD gatilho 1400 -> habilita (JAN forte compensa)
    const lancs = [lanc(1, 2000, "P1"), lanc(2, 100, "P2")];
    const metas = [meta(1, 1000), meta(2, 1000)];
    const ap = apurarAno(lancs, metas, regra, 2026);
    expect(ap[0].habilita).toBe(true);
    expect(ap[1].habilita).toBe(true);
  });

  it("perde elegibilidade quando acumulado YTD cai abaixo do gatilho", () => {
    // JAN EP 800 (meta 1000), gatilho 700 -> YTD 800>=700 habilita
    // FEV EP 100 -> YTD EP 900 < gatilho YTD 1400 -> NÃO habilita
    const lancs = [lanc(1, 800, "P1"), lanc(2, 100, "P2")];
    const metas = [meta(1, 1000), meta(2, 1000)];
    const ap = apurarAno(lancs, metas, regra, 2026);
    expect(ap[0].habilita).toBe(true);
    expect(ap[1].habilita).toBe(false);
  });

  it("gatilhoPct = 0 sempre habilita", () => {
    const semGatilho: RegraVendedor = { comissaoPct: 0.015, gatilhoPct: 0 };
    const ap = apurarAno([lanc(1, 1, "P1")], [meta(1, 1_000_000)], semGatilho, 2026);
    expect(ap[0].habilita).toBe(true);
  });

  it("saldo acumulado é YTD", () => {
    const lancs = [lanc(1, 1200, "P1"), lanc(2, 900, "P2")];
    const metas = [meta(1, 1000), meta(2, 1000)];
    const ap = apurarAno(lancs, metas, regra, 2026);
    expect(ap[0].saldoAcumulado).toBe(200);   // +200
    expect(ap[1].saldoAcumulado).toBe(100);   // +200 -100
  });

  it("dedup: two null itemPedido of same pedido counted as one", () => {
    const lancs = [
      lanc(1, 500, "P1", "", null, 100),
      lanc(1, 500, "P1", "", null, 100),
    ];
    // Create proper null-item lancs
    const lancamentos: LancamentoInput[] = [
      {
        numeroPedido: "P1",
        itemPedido: null,
        dataEmissao: new Date(2026, 0, 10),
        valor: 500,
        codVendedor: VEND,
        dataPagamento: null,
        parcela: null,
        pctRateio: 100,
        classificacao: "PREVISTO",
      },
      {
        numeroPedido: "P1",
        itemPedido: null,
        dataEmissao: new Date(2026, 0, 10),
        valor: 500,
        codVendedor: VEND,
        dataPagamento: null,
        parcela: null,
        pctRateio: 100,
        classificacao: "PREVISTO",
      },
    ];
    const ap = apurarAno(lancamentos, [meta(1, 1000)], regra, 2026);
    expect(ap[0].ep).toBe(500); // counted once, not twice
  });

  it("different itemPedido of same pedido are separate", () => {
    const lancamentos: LancamentoInput[] = [
      {
        numeroPedido: "P1",
        itemPedido: "A",
        dataEmissao: new Date(2026, 0, 10),
        valor: 100,
        codVendedor: VEND,
        dataPagamento: null,
        parcela: null,
        pctRateio: 100,
        classificacao: "PREVISTO",
      },
      {
        numeroPedido: "P1",
        itemPedido: "B",
        dataEmissao: new Date(2026, 0, 10),
        valor: 200,
        codVendedor: VEND,
        dataPagamento: null,
        parcela: null,
        pctRateio: 100,
        classificacao: "PREVISTO",
      },
    ];
    const ap = apurarAno(lancamentos, [meta(1, 1000)], regra, 2026);
    expect(ap[0].ep).toBe(300); // both items counted separately
  });

  it("ignores lancamentos from different year", () => {
    const lancamentos: LancamentoInput[] = [
      lanc(1, 1000, "P1"),
      {
        numeroPedido: "P2",
        itemPedido: "A",
        dataEmissao: new Date(2025, 0, 10), // different year
        valor: 1000,
        codVendedor: VEND,
        dataPagamento: null,
        parcela: null,
        pctRateio: 100,
        classificacao: "PREVISTO",
      },
    ];
    const ap = apurarAno(lancamentos, [meta(1, 1000)], regra, 2026);
    expect(ap[0].ep).toBe(1000); // only 2026 counted
  });

  it("zero metas default to 0", () => {
    const ap = apurarAno([lanc(1, 500, "P1")], [], regra, 2026);
    expect(ap[0].meta).toBe(0);
    expect(ap[0].gatilho).toBe(0);
    expect(ap[0].saldo).toBe(500); // ep - meta = 500 - 0
  });
});
