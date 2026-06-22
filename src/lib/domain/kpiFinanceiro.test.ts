import { describe, it, expect } from "vitest";
import {
  agingBucket,
  diffDays,
  normalizeClienteKey,
  groupAReceber,
  groupAFaturar,
  type TituloReceberItem,
  type PedidoAFaturarItem,
} from "./kpiFinanceiro";

describe("agingBucket", () => {
  it("classifica nas faixas do modelo manual", () => {
    expect(agingBucket(0)).toBe("0-29");
    expect(agingBucket(29)).toBe("0-29");
    expect(agingBucket(30)).toBe("30-60");
    expect(agingBucket(60)).toBe("30-60");
    expect(agingBucket(61)).toBe("61-90");
    expect(agingBucket(90)).toBe("61-90");
    expect(agingBucket(91)).toBe("91-120");
    expect(agingBucket(120)).toBe("91-120");
    expect(agingBucket(121)).toBe(">120");
    expect(agingBucket(999)).toBe(">120");
  });
});

describe("diffDays", () => {
  it("conta dias inteiros ignorando horas", () => {
    expect(diffDays(new Date("2026-06-01T23:00:00"), new Date("2026-06-02T01:00:00"))).toBe(1);
    expect(diffDays(new Date("2026-06-22"), new Date("2026-06-22"))).toBe(0);
    expect(diffDays(new Date("2026-06-22"), new Date("2026-06-01"))).toBe(-21);
  });
});

describe("normalizeClienteKey", () => {
  it("normaliza caixa, acentos e espaços", () => {
    expect(normalizeClienteKey("  Ações  do   Brasil ")).toBe("ACOES DO BRASIL");
    expect(normalizeClienteKey("3M - SUMARE")).toBe(normalizeClienteKey("3m - sumare"));
    expect(normalizeClienteKey(null)).toBe("");
  });
});

describe("groupAReceber", () => {
  const hoje = new Date("2026-06-22");

  it("funde filiais de mesmo nome (cadastros diferentes) numa linha", () => {
    const titulos: TituloReceberItem[] = [
      { codigoCliente: "C000130", loja: "01", nomeCliente: "ALUMAR", saldoVencido: 0, saldoAVencer: 100, diasAtraso: 0, vencimento: new Date("2026-07-04") },
      { codigoCliente: "C000130", loja: "02", nomeCliente: "ALUMAR", saldoVencido: 50, saldoAVencer: 0, diasAtraso: 40, vencimento: new Date("2026-05-13") },
      { codigoCliente: "C009999", loja: "01", nomeCliente: "Alumar", saldoVencido: 0, saldoAVencer: 25, diasAtraso: 0, vencimento: new Date("2026-08-01") },
    ];
    const out = groupAReceber(titulos, hoje);
    expect(out).toHaveLength(1);
    const a = out[0];
    expect(a.cliente).toBe("ALUMAR");
    expect(a.qtdTitulos).toBe(3);
    expect(a.qtdCadastros).toBe(3); // C000130-01, C000130-02, C009999-01
    expect(a.codigos).toEqual(["C000130", "C009999"]);
    expect(a.totalVencido).toBe(50);
    expect(a.totalAVencer).toBe(125);
    expect(a.total).toBe(175);
    expect(a.maiorAtraso).toBe(40);
    expect(a.agingVencido["30-60"]).toBe(50);
    expect(a.agingAVencer["0-29"]).toBe(100); // vence 04/07 (12 dias)
    expect(a.agingAVencer["30-60"]).toBe(25); // vence 01/08 (40 dias)
  });

  it("ordena por total desc", () => {
    const titulos: TituloReceberItem[] = [
      { codigoCliente: "C1", loja: "01", nomeCliente: "PEQUENO", saldoVencido: 0, saldoAVencer: 10, diasAtraso: 0, vencimento: hoje },
      { codigoCliente: "C2", loja: "01", nomeCliente: "GRANDE", saldoVencido: 0, saldoAVencer: 1000, diasAtraso: 0, vencimento: hoje },
    ];
    const out = groupAReceber(titulos, hoje);
    expect(out.map((c) => c.cliente)).toEqual(["GRANDE", "PEQUENO"]);
  });
});

describe("groupAFaturar", () => {
  const hoje = new Date("2026-06-22");

  const pedidos: PedidoAFaturarItem[] = [
    { numPedido: "PV1", cliente: "ALUMAR", vlrTotal: 100, dtEmissao: new Date("2026-06-01"), dtEntrega: new Date("2026-07-01") },
    { numPedido: "PV1", cliente: "ALUMAR", vlrTotal: 50, dtEmissao: new Date("2026-03-01"), dtEntrega: new Date("2026-06-10") },
    { numPedido: "PV2", cliente: "alumar", vlrTotal: 25, dtEmissao: null, dtEntrega: null },
  ];

  it("agrupa por cliente, conta pedidos e itens distintos", () => {
    const out = groupAFaturar(pedidos, "emissao", hoje);
    expect(out).toHaveLength(1);
    const a = out[0];
    expect(a.qtdItens).toBe(3);
    expect(a.qtdPedidos).toBe(2); // PV1, PV2
    expect(a.total).toBe(175);
    expect(a.semData).toBe(25); // PV2 sem dtEmissao
  });

  it("aging por emissão (idade do pedido)", () => {
    const out = groupAFaturar(pedidos, "emissao", hoje);
    const a = out[0];
    // 01/06 → 22/06 = 21 dias (0-29); 01/03 → 22/06 = 113 dias (91-120)
    expect(a.aging["0-29"]).toBe(100);
    expect(a.aging["91-120"]).toBe(50);
    expect(a.diasMax).toBe(113);
  });

  it("aging por entrega prevista (entrega futura cai na 1a faixa)", () => {
    const out = groupAFaturar(pedidos, "entrega", hoje);
    const a = out[0];
    // entrega 01/07 (futuro) → 0; entrega 10/06 → 12 dias atraso; ambos 0-29
    expect(a.aging["0-29"]).toBe(150);
    expect(a.semData).toBe(25);
  });
});
