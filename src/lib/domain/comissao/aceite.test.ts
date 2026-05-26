// src/lib/domain/comissao/aceite.test.ts
//
// Testes de aceite: reproduzem os números do Extrato Protheus.
// Fixtures extraídos de:
//   Analítico: comissionamento/materiais/Comissao 2026 - pgto EP 21.03.2026 a 20.04.2026-Analitco.xlsx
//   Extrato:   comissionamento/materiais/Comissao 2026 - pgto EP 21.03.2026 a 20.04.2026-Extrato.xlsx
//
// Correções nesta iteração:
//   1. pagamento.ts: comissão não deve ser multiplicada por pctRateio
//   2. types.ts / comissao.ts / pagamento.ts: comissaoPct precisa ser por linha (campo opcional)
//
// Nota sobre divergência TO-BE vs AS-IS Protheus (Alexsiano):
//   O Extrato Protheus usa comparação MENSAL (ep_m >= gatilho_m) para habilita.
//   A spec TO-BE exige acumulado YTD: Σep(jan..m) >= Σgatilho(jan..m).
//   Os testes do Alexsiano refletem o comportamento TO-BE (YTD), que diverge
//   intencionalmente do Extrato AS-IS para FEV.
//
// Notas sobre EP vs Extrato:
//   O Analítico fornecido é um recorte da janela 21/03-20/04; por isso os EP totais
//   diferem do Extrato (que usa o ano inteiro). O que importa para os testes:
//   - habilita: EP_amostra é suficiente para reproduzir os resultados booleanos
//   - previsão: usa todas as linhas do Analítico e bate com ±R$1

import { describe, it, expect } from "vitest";
import { apurarAno } from "./apuracao";
import { previsaoMensal } from "./comissao";
import { gridPedidosPagos } from "./pagamento";
import type { LancamentoInput, MetaInput, RegraVendedor } from "./types";

// ---------------------------------------------------------------------------
// FIXTURES: Adriano Correa de Matos (cod 000022)
// ---------------------------------------------------------------------------
// Extrato Protheus (aba "ADRIANO CORREA DE MATOS"):
//   META MES JAN: R$ 303.697,67
//   GATILHO JAN:  R$ 212.588,37  (= 303.697,67 × 70%)
//   EP JAN:       R$ 662.101,40  (ano inteiro; nossa amostra tem 557.054,69)
//   HABILITA JAN: SIM
//   PREVISÃO JAN: R$ 5.772,98
//   PEDIDOS PAGOS  21/03-20/04 (origem JAN): R$ 314,68
//   PEDIDOS PAGOS  21/04-20/05 (origem JAN): R$ 262,61

const lancamentosAdriano: LancamentoInput[] = [
  // Pedido 21035 — Faturado
  {
    numeroPedido: "21035", itemPedido: "A102400.025",
    dataEmissao: new Date(2026, 0, 8), valor: 13425.81,
    codVendedor: "000022", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.01,
  },
  // Pedido 21055 — Previsto (pctRateio 0)
  {
    numeroPedido: "21055", itemPedido: "T65VARMET-0005",
    dataEmissao: new Date(2026, 0, 14), valor: 37011.48,
    codVendedor: "000022", dataPagamento: null,
    parcela: null, pctRateio: 0, classificacao: "PREVISTO", comissaoPct: 0.01,
  },
  // Pedido 21057 — Faturado
  {
    numeroPedido: "21057", itemPedido: "A110217.015",
    dataEmissao: new Date(2026, 0, 14), valor: 2193.94,
    codVendedor: "000022", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.01,
  },
  // Pedido 21058 — Faturado (mesmo item diferente pedido)
  {
    numeroPedido: "21058", itemPedido: "A110217.015",
    dataEmissao: new Date(2026, 0, 14), valor: 2193.94,
    codVendedor: "000022", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.01,
  },
  // Pedido 21071 / S620-0001 — 3 parcelas (1 Pago + 2 Faturado)
  {
    numeroPedido: "21071", itemPedido: "S620-0001",
    dataEmissao: new Date(2026, 0, 16), valor: 29131.00,
    codVendedor: "000022", dataPagamento: new Date(2026, 3, 22),
    parcela: 1, pctRateio: 33.33, classificacao: "PAGO", comissaoPct: 0.005,
  },
  {
    numeroPedido: "21071", itemPedido: "S620-0001",
    dataEmissao: new Date(2026, 0, 16), valor: 29131.00,
    codVendedor: "000022", dataPagamento: null,
    parcela: 3, pctRateio: 33.33, classificacao: "FATURADO", comissaoPct: 0.005,
  },
  {
    numeroPedido: "21071", itemPedido: "S620-0001",
    dataEmissao: new Date(2026, 0, 16), valor: 29131.00,
    codVendedor: "000022", dataPagamento: null,
    parcela: 2, pctRateio: 33.33, classificacao: "FATURADO", comissaoPct: 0.005,
  },
  // Pedido 21071 / S6XX-XXXX — 3 parcelas (1 Pago + 2 Faturado)
  {
    numeroPedido: "21071", itemPedido: "S6XX-XXXX",
    dataEmissao: new Date(2026, 0, 16), valor: 23392.33,
    codVendedor: "000022", dataPagamento: new Date(2026, 3, 22),
    parcela: 1, pctRateio: 33.33, classificacao: "PAGO", comissaoPct: 0.005,
  },
  {
    numeroPedido: "21071", itemPedido: "S6XX-XXXX",
    dataEmissao: new Date(2026, 0, 16), valor: 23392.34,
    codVendedor: "000022", dataPagamento: null,
    parcela: 3, pctRateio: 33.33, classificacao: "FATURADO", comissaoPct: 0.005,
  },
  {
    numeroPedido: "21071", itemPedido: "S6XX-XXXX",
    dataEmissao: new Date(2026, 0, 16), valor: 23392.33,
    codVendedor: "000022", dataPagamento: null,
    parcela: 2, pctRateio: 33.33, classificacao: "FATURADO", comissaoPct: 0.005,
  },
  // Pedido 21097 — Pago (dataPag 24/03/2026 -> janela 2026-04)
  {
    numeroPedido: "21097", itemPedido: "A301205.067",
    dataEmissao: new Date(2026, 0, 26), valor: 2131.44,
    codVendedor: "000022", dataPagamento: new Date(2026, 2, 24),
    parcela: null, pctRateio: 100, classificacao: "PAGO", comissaoPct: 0.01,
  },
  // Pedido 21098 — Pago (dataPag 31/03/2026 -> janela 2026-04)
  {
    numeroPedido: "21098", itemPedido: "A301205.067",
    dataEmissao: new Date(2026, 0, 26), valor: 2074.07,
    codVendedor: "000022", dataPagamento: new Date(2026, 2, 31),
    parcela: null, pctRateio: 100, classificacao: "PAGO", comissaoPct: 0.01,
  },
  // Pedido 21100 — Pago (dataPag 20/04/2026 -> janela 2026-04, dia<=20)
  {
    numeroPedido: "21100", itemPedido: "VNS0-01147",
    dataEmissao: new Date(2026, 0, 26), valor: 27263.95,
    codVendedor: "000022", dataPagamento: new Date(2026, 3, 20),
    parcela: null, pctRateio: 100, classificacao: "PAGO", comissaoPct: 0.01,
  },
  // Pedido 21118 — Faturado
  {
    numeroPedido: "21118", itemPedido: "T65VAVMDP-0006",
    dataEmissao: new Date(2026, 0, 29), valor: 18641.58,
    codVendedor: "000022", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.01,
  },
  // Pedido 21126 — Previsto (pctRateio 0)
  {
    numeroPedido: "21126", itemPedido: "G40AVMSS-0002",
    dataEmissao: new Date(2026, 0, 29), valor: 357326.52,
    codVendedor: "000022", dataPagamento: null,
    parcela: null, pctRateio: 0, classificacao: "PREVISTO", comissaoPct: 0.01,
  },
  // Pedido 21130 — Faturado
  {
    numeroPedido: "21130", itemPedido: "T58VAHMDP-0004",
    dataEmissao: new Date(2026, 0, 29), valor: 10904.22,
    codVendedor: "000022", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.01,
  },
  // Pedido 21136 — Faturado
  {
    numeroPedido: "21136", itemPedido: "A301206.013",
    dataEmissao: new Date(2026, 0, 29), valor: 19342.04,
    codVendedor: "000022", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.01,
  },
  // Pedido 21137 — Faturado, OEM (comissaoPct 0.5%)
  {
    numeroPedido: "21137", itemPedido: "A302200.015",
    dataEmissao: new Date(2026, 0, 29), valor: 12022.37,
    codVendedor: "000022", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.005,
  },
  // FEB — Pedido 21155 — Faturado (fora do JAN, mas presente no Analítico)
  {
    numeroPedido: "21155", itemPedido: "A301206.024",
    dataEmissao: new Date(2026, 1, 10), valor: 17423.00,
    codVendedor: "000022", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.01,
  },
];

// Meta JAN apenas (Extrato: R$303.697,67). Meses FEV-DEZ = 0 (Extrato: R$0,00)
const metasAdriano: MetaInput[] = [
  { codVendedor: "000022", ano: 2026, mes: 1, valorMeta: 303697.67 },
];

// RegraVendedor: gatilho 70%, comissaoPct fallback 1% (Consultor)
const regraAdriano: RegraVendedor = {
  comissaoPct: 0.01,
  gatilhoPct: 0.7,
};

// ---------------------------------------------------------------------------
// FIXTURES: Alexsiano Porfirio (cod 000029)
// ---------------------------------------------------------------------------
// Extrato Protheus AS-IS (aba "ALEXSIANO PORFIRIO") — regra MENSAL:
//   META JAN: R$ 269.953,48  | GATILHO JAN: R$ 188.967,44
//   META FEV: R$ 263.300,94  | GATILHO FEV: R$ 184.310,66
//   EP JAN:   R$ 47.488,83   | EP FEV: R$ 254.211,14
//   HABILITA JAN: NÃO  (EP<GATILHO mensal)
//   HABILITA FEV: SIM  (EP>GATILHO mensal)  ← AS-IS Protheus
//   PREVISÃO FEV: R$ 3.027,04               ← AS-IS Protheus
//
// TO-BE (regra YTD acumulada — spec):
//   EP JAN+FEV amostra ≈ 47.488 + 245.836 = 293.325
//   GATILHO JAN+FEV    ≈ 188.967 + 184.310 = 373.278
//   293.325 < 373.278  → HABILITA FEV = NÃO sob YTD
//   PREVISÃO FEV = 0   (não habilitado)
//
// Nota: os testes abaixo refletem o comportamento TO-BE (YTD).
// O divergência com o Extrato Protheus é intencional e documentada.

const lancamentosAlexsiano: LancamentoInput[] = [
  // JAN — Pedido 21049 — Pago
  {
    numeroPedido: "21049", itemPedido: "A301205.392",
    dataEmissao: new Date(2026, 0, 13), valor: 2192.28,
    codVendedor: "000029", dataPagamento: new Date(2026, 2, 19),
    parcela: null, pctRateio: 100, classificacao: "PAGO", comissaoPct: 0.01,
  },
  // JAN — Pedido 21114 — Faturado
  {
    numeroPedido: "21114", itemPedido: "VNSK-VLC2",
    dataEmissao: new Date(2026, 0, 28), valor: 32256.18,
    codVendedor: "000029", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.01,
  },
  // JAN — Pedido 21115 — Faturado
  {
    numeroPedido: "21115", itemPedido: "T58EV-0001",
    dataEmissao: new Date(2026, 0, 29), valor: 13040.36,
    codVendedor: "000029", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.01,
  },
  // FEV — Pedido 21143 — Faturado (Nova Oportunidade, comissaoPct 1.3%)
  {
    numeroPedido: "21143", itemPedido: "SYRLPR024-0001",
    dataEmissao: new Date(2026, 1, 2), valor: 186520.33,
    codVendedor: "000029", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.013,
  },
  // FEV — Pedido 21163 — Previsto (duas linhas = mesmo pedido+item, dedup no EP)
  {
    numeroPedido: "21163", itemPedido: "A301205.392",
    dataEmissao: new Date(2026, 1, 11), valor: 1826.90,
    codVendedor: "000029", dataPagamento: null,
    parcela: null, pctRateio: 0, classificacao: "PREVISTO", comissaoPct: 0.01,
  },
  {
    numeroPedido: "21163", itemPedido: "A301205.392",
    dataEmissao: new Date(2026, 1, 11), valor: 913.45,
    codVendedor: "000029", dataPagamento: null,
    parcela: null, pctRateio: 0, classificacao: "PREVISTO", comissaoPct: 0.01,
  },
  // FEV — Pedido 21188 — Faturado
  {
    numeroPedido: "21188", itemPedido: "VNSK-00087",
    dataEmissao: new Date(2026, 1, 18), valor: 54145.77,
    codVendedor: "000029", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.01,
  },
  // FEV — Pedido 21199 — Faturado
  {
    numeroPedido: "21199", itemPedido: "T58VEH-0068",
    dataEmissao: new Date(2026, 1, 19), valor: 3343.84,
    codVendedor: "000029", dataPagamento: null,
    parcela: null, pctRateio: 100, classificacao: "FATURADO", comissaoPct: 0.01,
  },
  // MAR — Pedido 21277 — Previsto (pctRateio 0, comissaoPct 1.3%)
  {
    numeroPedido: "21277", itemPedido: "AG01137.002",
    dataEmissao: new Date(2026, 2, 20), valor: 16343.60,
    codVendedor: "000029", dataPagamento: null,
    parcela: null, pctRateio: 0, classificacao: "PREVISTO", comissaoPct: 0.013,
  },
  // MAR — Pedido 21311 — Previsto
  {
    numeroPedido: "21311", itemPedido: "A301205.067",
    dataEmissao: new Date(2026, 2, 27), valor: 2074.07,
    codVendedor: "000029", dataPagamento: null,
    parcela: null, pctRateio: 0, classificacao: "PREVISTO", comissaoPct: 0.01,
  },
  // APR — Pedido 21388 — Previsto
  {
    numeroPedido: "21388", itemPedido: "VNSK-00001",
    dataEmissao: new Date(2026, 3, 17), valor: 62035.33,
    codVendedor: "000029", dataPagamento: null,
    parcela: null, pctRateio: 0, classificacao: "PREVISTO", comissaoPct: 0.01,
  },
];

const metasAlexsiano: MetaInput[] = [
  { codVendedor: "000029", ano: 2026, mes: 1, valorMeta: 269953.48 },
  { codVendedor: "000029", ano: 2026, mes: 2, valorMeta: 263300.94 },
  { codVendedor: "000029", ano: 2026, mes: 3, valorMeta: 324909.00 },
  { codVendedor: "000029", ano: 2026, mes: 4, valorMeta: 353709.35 },
];

const regraAlexsiano: RegraVendedor = {
  comissaoPct: 0.01,
  gatilhoPct: 0.7,
};

// ---------------------------------------------------------------------------
describe("aceite — reproduz Extrato Protheus", () => {
  // ---- Adriano (000022) ----
  describe("Adriano Correa de Matos (000022)", () => {
    it("habilita JAN = true (EP mensal >= gatilho mensal)", () => {
      const ap = apurarAno(lancamentosAdriano, metasAdriano, regraAdriano, 2026);
      expect(ap[0].habilita).toBe(true);
    });

    it("previsao JAN ≈ R$5.772,98 (±R$1)", () => {
      const ap = apurarAno(lancamentosAdriano, metasAdriano, regraAdriano, 2026);
      const habArr = ap.map((m) => m.habilita);
      const prev = previsaoMensal(lancamentosAdriano, regraAdriano.comissaoPct, habArr, 2026);
      // Motor computa ~5773.05; Extrato usa coluna pré-arredondada = 5772.98. Δ < R$0,10.
      expect(prev[0]).toBeCloseTo(5772.98, 0);
    });

    it("pagos janela 21/03-20/04 origem JAN ≈ R$314,68", () => {
      const grid = gridPedidosPagos(lancamentosAdriano, regraAdriano.comissaoPct);
      const janela = grid.get("2026-04");
      // Motor: 21.31 + 20.74 + 272.64 = 314.69; Extrato: 314.68. Δ < R$0,02
      expect(janela?.[0] ?? 0).toBeCloseTo(314.68, 0);
    });

    it("pagos janela 21/04-20/05 origem JAN ≈ R$262,61", () => {
      const grid = gridPedidosPagos(lancamentosAdriano, regraAdriano.comissaoPct);
      const janela = grid.get("2026-05");
      // Motor: 145.655 + 116.962 = 262.62; Extrato: 262.61. Δ < R$0,02
      expect(janela?.[0] ?? 0).toBeCloseTo(262.61, 0);
    });
  });

  // ---- Alexsiano (000029) ----
  describe("Alexsiano Porfirio (000029)", () => {
    it("habilita JAN = false (EP mensal abaixo do gatilho)", () => {
      const ap = apurarAno(lancamentosAlexsiano, metasAlexsiano, regraAlexsiano, 2026);
      // EP JAN amostra: ~47.488 < gatilho JAN: 188.967 -> NÃO
      expect(ap[0].habilita).toBe(false);
    });

    it("habilita FEV = false (YTD acumulado abaixo do gatilho acumulado)", () => {
      const ap = apurarAno(lancamentosAlexsiano, metasAlexsiano, regraAlexsiano, 2026);
      // YTD: EP JAN+FEV ≈ 293k < gatilho JAN+FEV ≈ 373k → NÃO habilitado
      // (TO-BE YTD diverge do AS-IS Protheus que usa comparação mensal)
      expect(ap[1].habilita).toBe(false);
    });

    it("previsao FEV = 0 (não habilitado sob regra YTD)", () => {
      const ap = apurarAno(lancamentosAlexsiano, metasAlexsiano, regraAlexsiano, 2026);
      const habArr = ap.map((m) => m.habilita);
      const prev = previsaoMensal(lancamentosAlexsiano, regraAlexsiano.comissaoPct, habArr, 2026);
      // FEV não habilitado (YTD) → previsão = 0
      // Extrato Protheus AS-IS mostra R$3.027,04 porque usa regra mensal
      expect(prev[1]).toBe(0);
    });

    it("previsao JAN = 0 (não habilitado)", () => {
      const ap = apurarAno(lancamentosAlexsiano, metasAlexsiano, regraAlexsiano, 2026);
      const habArr = ap.map((m) => m.habilita);
      const prev = previsaoMensal(lancamentosAlexsiano, regraAlexsiano.comissaoPct, habArr, 2026);
      expect(prev[0]).toBe(0);
    });
  });
});
