import { describe, it, expect } from "vitest";
import { enrichPedidos } from "./enrich";
import {
  ClassificacaoInput,
  EstoqueInput,
  FollowUpInput,
  PedidoInput,
} from "./types";

const today = new Date("2026-05-06T00:00:00Z");

describe("enrichPedidos — fluxo completo", () => {
  it("integra alocação FIFO + follow-up + classificação + ação", () => {
    const pedidos: PedidoInput[] = [
      {
        id: "p1",
        numPedido: "15300",
        item: 1,
        produto: "ABC",
        descricaoProduto: "Cabo industrial",
        quantidade: 5,
        vlrTotal: 1000,
        margemPct: null,
        dtEmissao: new Date("2026-01-15"),
        dtOfertada: null,
        dtFatCli: new Date("2026-04-01"),
        notaFiscal: null,
        numeroSC: "5001",
        itemSC: 1,
        numeroOP: null,
        itemOP: null,
        pedCliente: null,
        nomeVendedor: "Maria",
        unidadeNegocio: "IND10",
      },
      {
        id: "p2",
        numPedido: "15400",
        item: 1,
        produto: "ABC",
        descricaoProduto: "Cabo industrial",
        quantidade: 10,
        vlrTotal: 2000,
        margemPct: null,
        dtEmissao: new Date("2026-02-10"),
        dtOfertada: null,
        dtFatCli: null,
        notaFiscal: null,
        numeroSC: null,
        itemSC: null,
        numeroOP: null,
        itemOP: null,
        pedCliente: null,
        nomeVendedor: "João",
        unidadeNegocio: "IND10",
      },
    ];

    const followUps: FollowUpInput[] = [
      {
        noSC: "5001",
        numeroPV: "15300",
        codigoItem: "ABC",
        pasta: "12/04 a 18/04",
        dtConfirma: new Date("2026-04-15"),
        dtPreEntr: new Date("2026-04-10"),
        dtChegadaAutron: null,
        noPO: null,
        opNaSC: null,
        pvInformadoSC: null,
      },
    ];

    const estoques: EstoqueInput[] = [{ codigo: "ABC", saldoEstoque: 5 }];

    const classificacoes: ClassificacaoInput[] = [
      { produto: "ABC", tipoProduto: "Comprando" },
    ];

    const enriched = enrichPedidos({ pedidos, followUps, estoques, classificacoes, today });

    const p1 = enriched.find((e) => e.id === "p1")!;
    const p2 = enriched.find((e) => e.id === "p2")!;

    // p1 (mais antigo) ganha o estoque
    expect(p1.disponibilidadeEstoque).toBe("SIM");
    expect(p1.qtdAlocada).toBe(5);
    expect(p1.fuDtConfirma).toEqual(new Date("2026-04-15"));
    expect(p1.prontoParaFazer).toBe("SIM");
    expect(p1.acaoNecessaria).toBe("Estoque OK");
    expect(p1.statusPedido).toBe("EM ABERTO");
    expect(p1.diasAtrasoCliente).toBe(35); // 2026-04-01 → 2026-05-06

    // p2 não tem estoque sobrando, classificado como Comprando, sem SC nem OP
    expect(p2.disponibilidadeEstoque).toBe("NAO");
    expect(p2.qtdAlocada).toBe(0);
    expect(p2.fuDtConfirma).toBeNull();
    expect(p2.prontoParaFazer).toBe("NAO");
    expect(p2.acaoNecessaria).toBe("Necessario gerar SC");
  });

  it("ERRO no CADASTRO: comprando com OP", () => {
    const pedidos: PedidoInput[] = [
      mkP({ id: "p1", produto: "X", quantidade: 1, numeroOP: "OP123" }),
    ];
    const enriched = enrichPedidos({
      pedidos,
      followUps: [],
      estoques: [],
      classificacoes: [{ produto: "X", tipoProduto: "Comprando" }],
      today,
    });
    expect(enriched[0].acaoNecessaria).toBe("ERRO no CADASTRO");
  });

  it("OP da SC dispara temOP via follow-up", () => {
    const pedidos: PedidoInput[] = [mkP({ id: "p1", produto: "X", numeroSC: "5001" })];
    const enriched = enrichPedidos({
      pedidos,
      followUps: [
        {
          noSC: "5001",
          numeroPV: null,
          codigoItem: null,
          pasta: null,
          dtConfirma: null,
          dtPreEntr: null,
          dtChegadaAutron: null,
          noPO: null,
          opNaSC: "OP777",
          pvInformadoSC: null,
        },
      ],
      estoques: [],
      classificacoes: [{ produto: "X", tipoProduto: "Comprando" }],
      today,
    });
    expect(enriched[0].temOP).toBe(true);
    expect(enriched[0].acaoNecessaria).toBe("ERRO no CADASTRO");
  });

  it("produto sem classificação fica 'Indefinido' → 'Verificar classificacao'", () => {
    const pedidos: PedidoInput[] = [mkP({ id: "p1", produto: "DESCONHECIDO" })];
    const enriched = enrichPedidos({
      pedidos,
      followUps: [],
      estoques: [],
      classificacoes: [],
      today,
    });
    expect(enriched[0].tipoProduto).toBe("Indefinido");
    expect(enriched[0].acaoNecessaria).toBe("Verificar classificacao");
  });
});

function mkP(o: Partial<PedidoInput> & { id: string; produto: string }): PedidoInput {
  return {
    numPedido: o.id,
    item: 1,
    descricaoProduto: null,
    quantidade: 1,
    vlrTotal: null,
    margemPct: null,
    dtEmissao: null,
    dtOfertada: null,
    dtFatCli: null,
    notaFiscal: null,
    numeroSC: null,
    itemSC: null,
    numeroOP: null,
    itemOP: null,
    pedCliente: null,
    nomeVendedor: null,
    unidadeNegocio: null,
    ...o,
  };
}
