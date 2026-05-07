import { describe, it, expect } from "vitest";
import { ehServico, statusPedido } from "./status";

describe("statusPedido", () => {
  it("EM ABERTO quando notaFiscal é null", () => {
    expect(statusPedido({ notaFiscal: null })).toBe("EM ABERTO");
  });
  it("FINALIZADO quando notaFiscal é número", () => {
    expect(statusPedido({ notaFiscal: 12345 })).toBe("FINALIZADO");
  });
  it("FINALIZADO inclusive com NF zero (presença = finalizado)", () => {
    expect(statusPedido({ notaFiscal: 0 })).toBe("FINALIZADO");
  });
});

describe("ehServico", () => {
  it.each([
    ["Serviço de instalação", true],
    ["servico extra", true],
    ["SERVIÇO técnico", true],
    ["MANUTENÇÃO", false],
    ["CABO COM MALHA TRANCADA", false],
    [null, false],
    ["", false],
  ])("ehServico(%j) === %s", (input, expected) => {
    expect(ehServico(input)).toBe(expected);
  });
});
