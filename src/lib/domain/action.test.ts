import { describe, it, expect } from "vitest";
import { acaoNecessaria } from "./action";

describe("acaoNecessaria", () => {
  it("Finalizado vence tudo", () => {
    expect(
      acaoNecessaria({
        status: "FINALIZADO",
        ehServico: true,
        disponibilidade: "NAO",
        tipoProduto: "Comprando",
        temSC: true,
        temOP: true,
      }),
    ).toBe("Finalizado");
  });

  it("Serviço (em aberto)", () => {
    expect(
      acaoNecessaria({
        status: "EM ABERTO",
        ehServico: true,
        disponibilidade: "NAO",
        tipoProduto: "Comprando",
        temSC: false,
        temOP: false,
      }),
    ).toBe("Prazo a confirmar");
  });

  it("Estoque OK quando tem saldo", () => {
    expect(
      acaoNecessaria({
        status: "EM ABERTO",
        ehServico: false,
        disponibilidade: "SIM",
        tipoProduto: "Produzindo",
        temSC: false,
        temOP: false,
      }),
    ).toBe("Estoque OK");
  });

  it("Comprando + tem OP = ERRO no CADASTRO", () => {
    expect(
      acaoNecessaria({
        status: "EM ABERTO",
        ehServico: false,
        disponibilidade: "NAO",
        tipoProduto: "Comprando",
        temSC: false,
        temOP: true,
      }),
    ).toBe("ERRO no CADASTRO");
  });

  it("Comprando + tem SC sem OP + com Dt. Confirma = SC gerada", () => {
    expect(
      acaoNecessaria({
        status: "EM ABERTO",
        ehServico: false,
        disponibilidade: "NAO",
        tipoProduto: "Comprando",
        temSC: true,
        temOP: false,
        fuDtConfirma: new Date("2026-06-15"),
      }),
    ).toBe("SC gerada - Aguardando");
  });

  it("Comprando + tem SC sem OP + sem Dt. Confirma = Item sem data confirmada", () => {
    expect(
      acaoNecessaria({
        status: "EM ABERTO",
        ehServico: false,
        disponibilidade: "NAO",
        tipoProduto: "Comprando",
        temSC: true,
        temOP: false,
        fuDtConfirma: null,
      }),
    ).toBe("Item sem data confirmada");
  });

  it("Comprando sem SC nem OP = Necessario gerar SC", () => {
    expect(
      acaoNecessaria({
        status: "EM ABERTO",
        ehServico: false,
        disponibilidade: "NAO",
        tipoProduto: "Comprando",
        temSC: false,
        temOP: false,
      }),
    ).toBe("Necessario gerar SC");
  });

  it("Produzindo + tem OP + com Dt. Confirma = OP gerada", () => {
    expect(
      acaoNecessaria({
        status: "EM ABERTO",
        ehServico: false,
        disponibilidade: "NAO",
        tipoProduto: "Produzindo",
        temSC: false,
        temOP: true,
        fuDtConfirma: new Date("2026-06-15"),
      }),
    ).toBe("OP gerada - Aguardando");
  });

  it("Produzindo + tem OP + sem Dt. Confirma = Item sem data confirmada", () => {
    expect(
      acaoNecessaria({
        status: "EM ABERTO",
        ehServico: false,
        disponibilidade: "NAO",
        tipoProduto: "Produzindo",
        temSC: false,
        temOP: true,
        fuDtConfirma: null,
      }),
    ).toBe("Item sem data confirmada");
  });

  it("Produzindo sem OP = Necessario gerar OP", () => {
    expect(
      acaoNecessaria({
        status: "EM ABERTO",
        ehServico: false,
        disponibilidade: "NAO",
        tipoProduto: "Produzindo",
        temSC: false,
        temOP: false,
      }),
    ).toBe("Necessario gerar OP");
  });

  it("Indefinido = Verificar classificacao", () => {
    expect(
      acaoNecessaria({
        status: "EM ABERTO",
        ehServico: false,
        disponibilidade: "NAO",
        tipoProduto: "Indefinido",
        temSC: false,
        temOP: false,
      }),
    ).toBe("Verificar classificacao");
  });
});
