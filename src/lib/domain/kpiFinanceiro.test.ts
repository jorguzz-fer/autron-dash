import { describe, it, expect } from "vitest";
import {
  agingBucket,
  diffDays,
  normalizeClienteKey,
  grupoKey,
  isProtesto,
  groupAReceber,
  groupAFaturar,
  type TituloReceberItem,
  type PedidoAFaturarItem,
} from "./kpiFinanceiro";

const titulo = (over: Partial<TituloReceberItem>): TituloReceberItem => ({
  codigoCliente: null,
  loja: "01",
  nomeCliente: null,
  saldoVencido: 0,
  saldoAVencer: 0,
  diasAtraso: 0,
  vencimento: null,
  emCartorio: false,
  ...over,
});

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

describe("grupoKey", () => {
  it("usa a primeira palavra (espaço, hífen ou barra)", () => {
    expect(grupoKey("GERDAU PINDA")).toBe("GERDAU");
    expect(grupoKey("GERDAU-COSIGUA")).toBe("GERDAU");
    expect(grupoKey("GERDAU-OURO BRANCO")).toBe("GERDAU");
    expect(grupoKey("3M - SUMARE")).toBe("3M");
    expect(grupoKey("VALLOUREC TUBOS")).toBe("VALLOUREC");
    expect(grupoKey(null)).toBe("");
  });
});

describe("isProtesto", () => {
  it("detecta protesto/cartório no histórico (coluna P)", () => {
    expect(isProtesto("EM PROTESTO")).toBe(true);
    expect(isProtesto("título protestado")).toBe(true);
    expect(isProtesto("ENVIADO P/ CARTÓRIO")).toBe(true);
    expect(isProtesto("CARTORIO 2o OFICIO")).toBe(true);
    expect(isProtesto("PREVISAO DE PAGTO 21/05")).toBe(false);
    expect(isProtesto(null)).toBe(false);
    expect(isProtesto("")).toBe(false);
  });
});

describe("groupAReceber", () => {
  const hoje = new Date("2026-06-22");

  it("funde unidades de mesmo grupo econômico (Gerdau) numa linha", () => {
    const titulos = [
      titulo({ codigoCliente: "C004423", nomeCliente: "GERDAU PINDA", saldoAVencer: 134828, vencimento: new Date("2026-07-20") }),
      titulo({ codigoCliente: "C001170", nomeCliente: "GERDAU RECIFE", saldoVencido: 49453, diasAtraso: 20 }),
      titulo({ codigoCliente: "C001167", loja: "02", nomeCliente: "GERDAU-COSIGUA", saldoVencido: 16504, diasAtraso: 50 }),
      titulo({ codigoCliente: "C000018", nomeCliente: "GERDAU-OURO BRANCO", saldoVencido: 95761, diasAtraso: 95 }),
    ];
    const out = groupAReceber(titulos, hoje);
    expect(out).toHaveLength(1);
    const g = out[0];
    expect(g.cliente).toBe("GERDAU");
    expect(g.unidades).toHaveLength(4);
    expect(g.qtdCadastros).toBe(4);
    expect(g.totalVencido).toBe(49453 + 16504 + 95761);
    expect(g.totalAVencer).toBe(134828);
    expect(g.maiorAtraso).toBe(95);
  });

  it("separa títulos em cartório do total vencido (3o status)", () => {
    const titulos = [
      titulo({ codigoCliente: "C1", nomeCliente: "CLIENTE X", saldoVencido: 100, diasAtraso: 40 }),
      titulo({ codigoCliente: "C1", nomeCliente: "CLIENTE X", saldoVencido: 200, diasAtraso: 200, emCartorio: true }),
    ];
    const [c] = groupAReceber(titulos, hoje);
    expect(c.totalVencido).toBe(100);
    expect(c.totalCartorio).toBe(200);
    expect(c.total).toBe(300);
    expect(c.agingVencido["30-60"]).toBe(100);
    expect(c.agingCartorio[">120"]).toBe(200);
    expect(c.maiorAtraso).toBe(200);
  });

  it("mantém nome completo quando o grupo tem 1 cadastro só", () => {
    const [c] = groupAReceber([titulo({ codigoCliente: "C9", nomeCliente: "FIBRASA SUDESTE", saldoVencido: 10, diasAtraso: 5 })], hoje);
    expect(c.cliente).toBe("FIBRASA SUDESTE");
    expect(c.unidades).toEqual(["FIBRASA SUDESTE"]);
  });

  it("ordena por total desc", () => {
    const titulos = [
      titulo({ codigoCliente: "C1", nomeCliente: "PEQUENO", saldoAVencer: 10, vencimento: hoje }),
      titulo({ codigoCliente: "C2", nomeCliente: "GRANDE", saldoAVencer: 1000, vencimento: hoje }),
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

  it("calcula prazo médio emissão → entrega prevista (ignora itens sem data)", () => {
    const out = groupAFaturar(pedidos, "emissao", hoje);
    const a = out[0];
    // 01/06→01/07 = 30 dias; 01/03→10/06 = 101 dias; PV2 sem datas é ignorado
    expect(a.qtdComPrazo).toBe(2);
    expect(a.leadMedioDias).toBeCloseTo((30 + 101) / 2);
  });
});
