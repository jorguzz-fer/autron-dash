// src/lib/domain/comissao/garantido.test.ts
import { describe, it, expect } from "vitest";
import { aplicaGarantido } from "./garantido";
import type { GarantidoConfig } from "./types";

describe("aplicaGarantido", () => {
  const previsao = [3000, 600, 750, 0, 1200, 0, 0, 0, 0, 0, 0, 0];

  it("sem config retorna a previsão inalterada", () => {
    expect(aplicaGarantido(previsao, 2026, null)).toEqual(previsao);
  });

  it("aplica piso = max(previsao, garantido) na janela", () => {
    // Garantido 2000 por 3 meses a partir de jan/2026.
    const cfg: GarantidoConfig = { valor: 2000, inicioAno: 2026, inicioMes: 1, meses: 3 };
    const r = aplicaGarantido(previsao, 2026, cfg);
    expect(r[0]).toBe(3000); // previsão 3000 > 2000 -> recebe a comissão (excedente)
    expect(r[1]).toBe(2000); // previsão 600 < 2000 -> recebe o garantido
    expect(r[2]).toBe(2000); // previsão 750 < 2000 -> recebe o garantido
    expect(r[3]).toBe(0);    // fora da janela -> previsão (0)
    expect(r[4]).toBe(1200); // fora da janela -> previsão
  });

  it("janela que cruza o ano só aplica nos meses do ano apurado", () => {
    // Contratado em nov/2026, garantido por 3 meses (nov, dez, jan/2027).
    const cfg: GarantidoConfig = { valor: 2000, inicioAno: 2026, inicioMes: 11, meses: 3 };
    // Apurando 2027: só jan/2027 está na janela.
    const prev2027 = new Array<number>(12).fill(100);
    const r = aplicaGarantido(prev2027, 2027, cfg);
    expect(r[0]).toBe(2000); // jan/2027 dentro da janela
    expect(r[1]).toBe(100);  // fev/2027 fora
  });

  it("config inválida (meses 0 ou valor 0) não altera", () => {
    expect(aplicaGarantido(previsao, 2026, { valor: 0, inicioAno: 2026, inicioMes: 1, meses: 3 })).toEqual(previsao);
    expect(aplicaGarantido(previsao, 2026, { valor: 2000, inicioAno: 2026, inicioMes: 1, meses: 0 })).toEqual(previsao);
  });
});
