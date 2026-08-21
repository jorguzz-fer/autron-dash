// src/lib/domain/comissao/representante.test.ts
// Regras do Anexo II (comissão de representantes), recebido em ago/2026.
import { describe, it, expect } from "vitest";
import {
  PCT_TIPO_VENDA,
  fatorDesconto,
  comissaoRepresentanteVenda,
  comissaoMec911,
  comissaoImportacaoDireta,
} from "./representante";

describe("PCT_TIPO_VENDA (tabela do Anexo II)", () => {
  it("NO/ME/SU pagam 8%; RE/SE pagam 5%", () => {
    expect(PCT_TIPO_VENDA.NO).toBe(0.08);
    expect(PCT_TIPO_VENDA.ME).toBe(0.08);
    expect(PCT_TIPO_VENDA.SU).toBe(0.08);
    expect(PCT_TIPO_VENDA.RE).toBe(0.05);
    expect(PCT_TIPO_VENDA.SE).toBe(0.05);
  });
});

describe("fatorDesconto (faixas do Anexo II, desconto em %)", () => {
  it("respeita os limites exatos de cada faixa", () => {
    expect(fatorDesconto(0)).toBe(1);
    expect(fatorDesconto(10)).toBe(1);      // até 10% não penaliza
    expect(fatorDesconto(10.01)).toBe(0.95); // 10,01–15
    expect(fatorDesconto(15)).toBe(0.95);
    expect(fatorDesconto(15.01)).toBe(0.9);  // 15,01–20
    expect(fatorDesconto(20)).toBe(0.9);
    expect(fatorDesconto(20.01)).toBe(0.85); // 20,01–25
    expect(fatorDesconto(25)).toBe(0.85);
    expect(fatorDesconto(25.01)).toBe(0.8);  // 25,01–30
    expect(fatorDesconto(30)).toBe(0.8);
    expect(fatorDesconto(30.01)).toBe(0.7);  // acima de 30
    expect(fatorDesconto(45)).toBe(0.7);
  });
});

describe("comissaoRepresentanteVenda", () => {
  it("valor × %tipo × fator do desconto", () => {
    // Nova Oportunidade de 100k sem desconto: 8% = 8.000
    expect(comissaoRepresentanteVenda({ valor: 100_000, tipoVenda: "NO" })).toBeCloseTo(8_000);
    // Reposição de 100k com 18% de desconto: 5% × 0,90 = 4.500
    expect(
      comissaoRepresentanteVenda({ valor: 100_000, tipoVenda: "RE", descontoPct: 18 }),
    ).toBeCloseTo(4_500);
    // Caso real ago/2026 (Cavanellas, Gerdau, RE, sem desconto): 32.809,77 × 5%
    expect(
      comissaoRepresentanteVenda({ valor: 32_809.77, tipoVenda: "RE" }),
    ).toBeCloseTo(1_640.49, 2);
  });
});

describe("comissaoMec911 (valor fixo por faixa do pedido)", () => {
  it("respeita os limites exatos das faixas", () => {
    expect(comissaoMec911(299_999)).toBe(6_000);
    expect(comissaoMec911(300_000)).toBe(6_000);   // "até 300.000"
    expect(comissaoMec911(300_000.01)).toBe(7_600);
    expect(comissaoMec911(400_000)).toBe(7_600);
    expect(comissaoMec911(400_000.01)).toBe(9_000);
    expect(comissaoMec911(500_000)).toBe(9_000);
    expect(comissaoMec911(500_000.01)).toBe(10_200);
    expect(comissaoMec911(600_000)).toBe(10_200);
    expect(comissaoMec911(600_000.01)).toBe(11_200);
    expect(comissaoMec911(700_000)).toBe(11_200);
    expect(comissaoMec911(700_000.01)).toBe(12_000);
    expect(comissaoMec911(1_500_000)).toBe(12_000);
  });
});

describe("comissaoImportacaoDireta", () => {
  it("2% sobre a comissão recebida pela Autron (não sobre a venda)", () => {
    expect(comissaoImportacaoDireta(10_000)).toBeCloseTo(200);
    expect(comissaoImportacaoDireta(0)).toBe(0);
  });
});
