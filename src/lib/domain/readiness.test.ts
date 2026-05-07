import { describe, it, expect } from "vitest";
import { prontoParaFazer } from "./readiness";

describe("prontoParaFazer", () => {
  it("FINALIZADO acima de tudo", () => {
    expect(
      prontoParaFazer({
        status: "FINALIZADO",
        disponibilidade: "NAO",
        fuDtConfirma: null,
      }),
    ).toBe("FINALIZADO");
  });

  it("Servico quando disponibilidade = Servico", () => {
    expect(
      prontoParaFazer({
        status: "EM ABERTO",
        disponibilidade: "Servico",
        fuDtConfirma: null,
      }),
    ).toBe("Servico");
  });

  it("SIM: estoque + follow-up confirmado", () => {
    expect(
      prontoParaFazer({
        status: "EM ABERTO",
        disponibilidade: "SIM",
        fuDtConfirma: new Date("2026-04-15"),
      }),
    ).toBe("SIM");
  });

  it("PARCIAL - Sem Follow-up: estoque sem confirmação", () => {
    expect(
      prontoParaFazer({
        status: "EM ABERTO",
        disponibilidade: "SIM",
        fuDtConfirma: null,
      }),
    ).toBe("PARCIAL - Sem Follow-up");
  });

  it("PARCIAL - Sem Estoque: confirmação sem estoque", () => {
    expect(
      prontoParaFazer({
        status: "EM ABERTO",
        disponibilidade: "PARCIAL",
        fuDtConfirma: new Date("2026-04-15"),
      }),
    ).toBe("PARCIAL - Sem Estoque");
  });

  it("NAO: sem nada", () => {
    expect(
      prontoParaFazer({
        status: "EM ABERTO",
        disponibilidade: "NAO",
        fuDtConfirma: null,
      }),
    ).toBe("NAO");
  });
});
