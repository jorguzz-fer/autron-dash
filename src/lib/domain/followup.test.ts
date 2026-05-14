import { describe, it, expect } from "vitest";
import { buildFollowUpIndex, consolidateFollowUp } from "./followup";
import { FollowUpInput, PedidoInput, PRAZO_A_DEFINIR } from "./types";

const basePedido: PedidoInput = {
  id: "p1",
  numPedido: "15314",
  item: 1,
  produto: "ABC123",
  descricaoProduto: "Cabo industrial",
  quantidade: 10,
  vlrTotal: 1000,
  margemPct: null,
  dtEmissao: new Date("2026-01-15"),
  dtEntrega: null,
  dtOfertada: null,
  dtFatCli: null,
  notaFiscal: null,
  numeroSC: "5001",
  itemSC: 1,
  numeroOP: null,
  itemOP: null,
  pedCliente: null,
  nomeVendedor: null,
  unidadeNegocio: "IND10",
  contrato: false,
  cliente: null,
};

describe("buildFollowUpIndex", () => {
  it("indexa por SC e por (PV, item)", () => {
    const fus: FollowUpInput[] = [
      mkFu({ noSC: "5001", numeroPV: "15314", codigoItem: "ABC123" }),
      mkFu({ noSC: "5002", numeroPV: "15315", codigoItem: "XYZ" }),
    ];
    const idx = buildFollowUpIndex(fus);
    expect(idx.bySC.size).toBe(2);
    expect(idx.byPVItem.size).toBe(2);
    expect(idx.bySC.get("5001")?.codigoItem).toBe("ABC123");
    expect(idx.byPVItem.get("15315|XYZ")?.noSC).toBe("5002");
  });

  it("quando há duplicatas para a mesma SC, mantém a primeira (paridade com Streamlit groupby.first)", () => {
    // app.py:340-352 faz groupby(...).agg('first'), então mantemos a primeira
    // linha encontrada — independente de qual é "mais informativa".
    const fus: FollowUpInput[] = [
      mkFu({ noSC: "5001", dtConfirma: null, dtPreEntr: new Date("2026-04-01") }),
      mkFu({ noSC: "5001", dtConfirma: new Date("2026-03-15"), dtPreEntr: null }),
    ];
    const idx = buildFollowUpIndex(fus);
    expect(idx.bySC.get("5001")?.dtConfirma).toBeNull();
    expect(idx.bySC.get("5001")?.dtPreEntr).toEqual(new Date("2026-04-01"));
  });
});

describe("consolidateFollowUp", () => {
  it("usa SC quando disponível", () => {
    const idx = buildFollowUpIndex([
      mkFu({
        noSC: "5001",
        numeroPV: "15314",
        codigoItem: "ABC123",
        dtConfirma: new Date("2026-04-15"),
        pasta: "12/04 a 18/04",
      }),
    ]);
    const fu = consolidateFollowUp(basePedido, idx);
    expect(fu.fuDtConfirma).toEqual(new Date("2026-04-15"));
    expect(fu.fuPasta).toBe("12/04 a 18/04");
    expect(fu.semanaEntrega).toBe("12/04 a 18/04");
    expect(fu.prazoRealEntrega).toEqual(new Date("2026-04-15"));
  });

  it("cai pra (PV+produto) quando SC não bate", () => {
    const idx = buildFollowUpIndex([
      mkFu({
        noSC: "9999",
        numeroPV: "15314",
        codigoItem: "ABC123",
        dtPreEntr: new Date("2026-05-01"),
      }),
    ]);
    const fu = consolidateFollowUp(basePedido, idx);
    expect(fu.fuDtConfirma).toBeNull();
    expect(fu.fuDtPreEntr).toEqual(new Date("2026-05-01"));
    expect(fu.prazoRealEntrega).toEqual(new Date("2026-05-01"));
    expect(fu.semanaEntrega).toBeNull();
  });

  it("retorna nulls quando nada bate", () => {
    const idx = buildFollowUpIndex([]);
    const fu = consolidateFollowUp(basePedido, idx);
    expect(fu.fuDtConfirma).toBeNull();
    expect(fu.prazoRealEntrega).toBeNull();
  });

  it("exceção IND21 + Posto: prazoRealEntrega = 'A definir' mesmo com follow-up", () => {
    const pedido = {
      ...basePedido,
      unidadeNegocio: "IND21",
      descricaoProduto: "Posto de operação modelo XPTO",
    };
    const idx = buildFollowUpIndex([
      mkFu({ noSC: "5001", dtConfirma: new Date("2026-04-15") }),
    ]);
    const fu = consolidateFollowUp(pedido, idx);
    expect(fu.prazoRealEntrega).toBe(PRAZO_A_DEFINIR);
  });

  it("exceção IND21 + Posto: zera fuDtConfirma/fuDtPreEntr e cascateia em semanaEntrega (app.py:424-426)", () => {
    // Garante que pedidos IND21 posto/cabine não vazam confirmação de prazo
    // para Pronto_para_Fazer nem para Semana_Entrega.
    const pedido = {
      ...basePedido,
      unidadeNegocio: "IND21",
      descricaoProduto: "Cabine principal",
    };
    const idx = buildFollowUpIndex([
      mkFu({
        noSC: "5001",
        dtConfirma: new Date("2026-04-15"),
        dtPreEntr: new Date("2026-04-10"),
        pasta: "12/04 a 18/04",
      }),
    ]);
    const fu = consolidateFollowUp(pedido, idx);
    expect(fu.fuDtConfirma).toBeNull();
    expect(fu.fuDtPreEntr).toBeNull();
    expect(fu.semanaEntrega).toBeNull();
    expect(fu.prazoRealEntrega).toBe(PRAZO_A_DEFINIR);
  });

  it("exceção IND21 + Cabine: prazoRealEntrega = 'A definir'", () => {
    const pedido = {
      ...basePedido,
      unidadeNegocio: "IND21",
      descricaoProduto: "CABINE PRINCIPAL DA LINHA 7",
    };
    const fu = consolidateFollowUp(pedido, buildFollowUpIndex([]));
    expect(fu.prazoRealEntrega).toBe(PRAZO_A_DEFINIR);
  });

  it("não dispara IND21 se descrição não tiver posto/cabine", () => {
    const pedido = { ...basePedido, unidadeNegocio: "IND21" };
    const fu = consolidateFollowUp(pedido, buildFollowUpIndex([]));
    expect(fu.prazoRealEntrega).toBeNull();
  });

  it("não dispara IND21 se unidade for outra mesmo com 'posto' na descrição", () => {
    const pedido = {
      ...basePedido,
      unidadeNegocio: "IND10",
      descricaoProduto: "Posto trabalho",
    };
    const fu = consolidateFollowUp(pedido, buildFollowUpIndex([]));
    expect(fu.prazoRealEntrega).toBeNull();
  });
});

function mkFu(partial: Partial<FollowUpInput>): FollowUpInput {
  return {
    noSC: "0000",
    numeroPV: null,
    codigoItem: null,
    pasta: null,
    dtConfirma: null,
    dtPreEntr: null,
    dtChegadaAutron: null,
    noPO: null,
    opNaSC: null,
    pvInformadoSC: null,
    ...partial,
  };
}
