// src/lib/domain/comissao/simulador.test.ts
//
// Teste de aceite do "simulador do Márcio" (simulador-comissoes.xlsx).
// Fonte canônica da regra YTD com arredondamento de 2 casas.
//
//        JAN     FEV     MAR     ABR     MAI    ...
// META   100k    120k    150k    150k    80k
// EP     200k    40k     50k     50k     80k    0
// ATING  200%    109%    78%     65%     70%
// PREV   3000    600     750     0       1200   -> TOTAL 5550
import { describe, it, expect } from "vitest";
import { apurarAno } from "./apuracao";
import { previsaoMensal } from "./comissao";
import type { LancamentoInput, MetaInput, RegraVendedor } from "./types";

const VEND = "SIM";
const regra: RegraVendedor = { comissaoPct: 0.015, gatilhoPct: 0.7 };

const METAS_VAL = [100000, 120000, 150000, 150000, 80000, 100000, 100000, 110000, 110000, 140000, 140000, 100000];
const EP_VAL = [200000, 40000, 50000, 50000, 80000, 0, 0, 0, 0, 0, 0, 0];

const metas: MetaInput[] = METAS_VAL.map((v, i) => ({ codVendedor: VEND, ano: 2026, mes: i + 1, valorMeta: v }));
const lancs: LancamentoInput[] = EP_VAL.map((v, i) => ({
  numeroPedido: `P${i}`,
  itemPedido: "A",
  dataEmissao: new Date(2026, i, 10),
  valor: v,
  codVendedor: VEND,
  dataPagamento: null,
  parcela: null,
  pctRateio: 100,
  classificacao: "PREVISTO" as const,
})).filter((l) => l.valor > 0);

describe("simulador do Márcio (aceite YTD com ARRED 2 casas)", () => {
  it("habilita exatamente jan,fev,mar,mai (abr cai abaixo de 70%)", () => {
    const ap = apurarAno(lancs, metas, regra, 2026);
    expect(ap.map((m) => m.habilita).slice(0, 6)).toEqual([true, true, true, false, true, false]);
  });

  it("MAI habilita no limite (atingimento arredonda para 0,70)", () => {
    // epAcum=420k, metaAcum=600k -> 0,70 exatos
    const ap = apurarAno(lancs, metas, regra, 2026);
    expect(ap[4].habilita).toBe(true);
  });

  it("previsão = 3000/600/750/0/1200 e total 5550", () => {
    const ap = apurarAno(lancs, metas, regra, 2026);
    const habilita = ap.map((m) => m.habilita);
    const prev = previsaoMensal(lancs, regra.comissaoPct, habilita, 2026);
    expect(prev.slice(0, 5)).toEqual([3000, 600, 750, 0, 1200]);
    expect(prev.reduce((s, v) => s + v, 0)).toBe(5550);
  });
});
