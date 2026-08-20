import { describe, it, expect } from "vitest";
import { fracaoParaPct, pctParaFracao } from "./percentual";

describe("pctParaFracao", () => {
  it("converte o percentual digitado na tela para a fração do banco", () => {
    expect(pctParaFracao(1.5)).toBe(0.015);
    expect(pctParaFracao(70)).toBe(0.7);
    expect(pctParaFracao(0.75)).toBe(0.0075);
    expect(pctParaFracao(100)).toBe(1);
    expect(pctParaFracao(0)).toBe(0);
  });

  it("não deixa sobra de ponto flutuante (Decimal(6,4) no banco)", () => {
    expect(pctParaFracao(1.15)).toBe(0.0115);
    expect(pctParaFracao(2.9)).toBe(0.029);
  });
});

describe("fracaoParaPct", () => {
  it("converte a fração do banco para o percentual da tela", () => {
    expect(fracaoParaPct(0.015)).toBe(1.5);
    expect(fracaoParaPct(0.7)).toBe(70);
    expect(fracaoParaPct(0.0075)).toBe(0.75);
    expect(fracaoParaPct(0)).toBe(0);
  });

  it("é o inverso de pctParaFracao nos valores usados na política", () => {
    for (const pct of [0.5, 0.75, 1, 1.5, 2, 70, 100]) {
      expect(fracaoParaPct(pctParaFracao(pct))).toBe(pct);
    }
  });
});
