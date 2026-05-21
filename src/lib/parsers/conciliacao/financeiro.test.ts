import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseFinanceiroCR,
  parseCodigoCliente,
  parseNumeroTitulo,
  parseParcela,
} from "./financeiro";

const FIXTURES = join(__dirname, "__fixtures__");
const FIXTURE_FINANCEIRO = join(FIXTURES, "financeiro-cr.xlsx");
/**
 * Os fixtures contêm dados REAIS do cliente Autron (códigos, NFs, valores) e
 * por isso NÃO são commitados (.gitignore *.xlsx). O dev coloca os arquivos
 * localmente em src/lib/parsers/conciliacao/__fixtures__/ para validar end-to-end.
 * Quando ausentes (CI ou fresh clone), os testes integrados pulam automaticamente.
 */
const fixturesDisponiveis = existsSync(FIXTURE_FINANCEIRO);

describe("parseNumeroTitulo", () => {
  it("extrai NF de '2  -000032433-'", () => {
    expect(parseNumeroTitulo("2  -000032433-")).toBe("32433");
  });
  it("extrai NF com parcela '2  -000032464-2'", () => {
    expect(parseNumeroTitulo("2  -000032464-2")).toBe("32464");
  });
  it("extrai número de RPS '-000000624-'", () => {
    expect(parseNumeroTitulo("RPS-000000624-")).toBe("624");
  });
  it("extrai NF de RA negativo 'RA -000120326-'", () => {
    expect(parseNumeroTitulo("RA -000120326-")).toBe("120326");
  });
  it("retorna string vazia pra entrada inválida", () => {
    expect(parseNumeroTitulo(null)).toBe("");
    expect(parseNumeroTitulo("")).toBe("");
    expect(parseNumeroTitulo("foo")).toBe("");
  });
});

describe("parseParcela", () => {
  it("extrai parcela '2  -000032464-3' → '3'", () => {
    expect(parseParcela("2  -000032464-3")).toBe("3");
  });
  it("extrai parcela letrada '2  -000032433-A' → 'A'", () => {
    expect(parseParcela("2  -000032433-A")).toBe("A");
  });
  it("retorna null pra título sem parcela '2  -000032433-'", () => {
    expect(parseParcela("2  -000032433-")).toBeNull();
  });
  it("retorna null pra string com só espaços após hífen", () => {
    expect(parseParcela("2  -000032433-  ")).toBeNull();
  });
  it("retorna null pra entrada inválida", () => {
    expect(parseParcela(null)).toBeNull();
    expect(parseParcela("")).toBeNull();
    expect(parseParcela("foo")).toBeNull();
  });
});

describe("parseCodigoCliente", () => {
  it("parse 'C000297-01-3M - SUMARE'", () => {
    expect(parseCodigoCliente("C000297-01-3M - SUMARE")).toEqual({
      codigo: "C000297",
      loja: "01",
      nome: "3M - SUMARE",
    });
  });
  it("parse com hífen no nome 'C000882-01-ARCELLORMITAL- JOAO'", () => {
    expect(parseCodigoCliente("C000882-01-ARCELLORMITAL- JOAO")).toEqual({
      codigo: "C000882",
      loja: "01",
      nome: "ARCELLORMITAL- JOAO",
    });
  });
  it("retorna nulls quando entrada é null", () => {
    expect(parseCodigoCliente(null)).toEqual({ codigo: null, loja: null, nome: null });
  });
});

describe.skipIf(!fixturesDisponiveis)("parseFinanceiroCR (fixture real)", () => {
  it("parseia o relatório completo sem erros", async () => {
    const buffer = readFileSync(join(FIXTURES, "financeiro-cr.xlsx"));
    const result = await parseFinanceiroCR(buffer);

    expect(result.warnings).toEqual([]);
    expect(result.rows.length).toBeGreaterThan(100);
    expect(result.totalSaldo).toBeGreaterThan(1_000_000);
  });

  it("extrai dataReferencia (Dt.Ref) da aba Parametros", async () => {
    const buffer = readFileSync(join(FIXTURES, "financeiro-cr.xlsx"));
    const result = await parseFinanceiroCR(buffer);
    expect(result.dataReferencia).toBeInstanceOf(Date);
    // O arquivo tem Dt.Ref: 31/03/2026
    expect(result.dataReferencia?.getUTCFullYear()).toBe(2026);
    expect(result.dataReferencia?.getUTCMonth()).toBe(2); // março = 2
    expect(result.dataReferencia?.getUTCDate()).toBe(31);
  });

  it("encontra a NF 32433 (3M - SUMARE) e atribui código C000297", async () => {
    const buffer = readFileSync(join(FIXTURES, "financeiro-cr.xlsx"));
    const result = await parseFinanceiroCR(buffer);
    const t = result.rows.find((r) => r.numeroNF === "32433");
    expect(t).toBeDefined();
    expect(t!.codigoCliente).toBe("C000297");
    expect(t!.nomeCliente).toBe("3M - SUMARE");
    expect(t!.tipo).toBe("NF");
    expect(t!.saldoTotal).toBeCloseTo(15212.89, 2);
  });

  it("encontra a RA negativa (NF 120326) com saldo total < 0", async () => {
    const buffer = readFileSync(join(FIXTURES, "financeiro-cr.xlsx"));
    const result = await parseFinanceiroCR(buffer);
    const ra = result.rows.find((r) => r.numeroNF === "120326");
    expect(ra).toBeDefined();
    expect(ra!.tipo).toBe("RA");
    expect(ra!.saldoTotal).toBeLessThan(0);
  });

  it("soma saldoTotal de todos os títulos = totalSaldo", async () => {
    const buffer = readFileSync(join(FIXTURES, "financeiro-cr.xlsx"));
    const result = await parseFinanceiroCR(buffer);
    const sumManual = result.rows.reduce((a, t) => a + t.saldoTotal, 0);
    expect(Math.abs(sumManual - result.totalSaldo)).toBeLessThan(0.01);
  });
});
