import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { conciliar, type TituloFinanceiroInput } from "./index";
import { parseFinanceiroCR } from "@/lib/parsers/conciliacao/financeiro";
import { parseBalanceteContabil } from "@/lib/parsers/conciliacao/contabil";

const FIXTURES = join(__dirname, "../../parsers/conciliacao/__fixtures__");
const fixturesDisponiveis =
  existsSync(join(FIXTURES, "financeiro-cr.xlsx")) &&
  existsSync(join(FIXTURES, "contabil-1121010001.xlsx"));

describe("conciliar — algoritmo isolado", () => {
  it("NF presente nos dois lados com saldos iguais — não vira divergência", () => {
    const titulos: TituloFinanceiroInput[] = [
      { numeroNF: "100", codigoCliente: "C001", nomeCliente: "X", saldoTotal: 1000 },
    ];
    const cont = new Map([["100", 1000]]);
    const r = conciliar(titulos, cont, 1000, 1000);
    expect(r.divergencias).toEqual([]);
    expect(r.bateuTotalizador).toBe(true);
  });

  it("NF com saldos diferentes vira DIVERGENTE", () => {
    const titulos: TituloFinanceiroInput[] = [
      { numeroNF: "200", codigoCliente: "C002", nomeCliente: "Y", saldoTotal: 1500 },
    ];
    const cont = new Map([["200", 1200]]);
    const r = conciliar(titulos, cont, 1500, 1200);
    expect(r.divergencias).toHaveLength(1);
    expect(r.divergencias[0]).toMatchObject({
      numeroNF: "200",
      lado: "DIVERGENTE",
      saldoFinanceiro: 1500,
      saldoContabil: 1200,
      diferenca: 300,
    });
    expect(r.bateuTotalizador).toBe(false);
  });

  it("NF só no financeiro vira SO_FINANCEIRO (não é erro garantido — período anterior)", () => {
    const titulos: TituloFinanceiroInput[] = [
      { numeroNF: "300", codigoCliente: "C003", nomeCliente: "Z", saldoTotal: 500 },
    ];
    const cont = new Map<string, number>();
    const r = conciliar(titulos, cont, 500, 0);
    expect(r.divergencias).toHaveLength(1);
    expect(r.divergencias[0]).toMatchObject({
      numeroNF: "300",
      lado: "SO_FINANCEIRO",
      saldoFinanceiro: 500,
      saldoContabil: null,
    });
  });

  it("NF só no contábil com saldo positivo vira SO_CONTABIL (bug provável)", () => {
    const r = conciliar([], new Map([["400", 800]]), 0, 800);
    expect(r.divergencias).toHaveLength(1);
    expect(r.divergencias[0]).toMatchObject({
      numeroNF: "400",
      lado: "SO_CONTABIL",
      saldoContabil: 800,
    });
  });

  it("NF criada e recebida no período (saldo contábil = 0) NÃO vira divergência", () => {
    const r = conciliar([], new Map([["500", 0]]), 0, 0);
    expect(r.divergencias).toEqual([]);
  });

  it("Saldo contábil negativo (só recebimento de NF antiga) NÃO vira divergência", () => {
    const r = conciliar([], new Map([["600", -2000]]), 0, -2000);
    expect(r.divergencias).toEqual([]);
  });

  it("tolerância de 1 centavo absorve arredondamento", () => {
    const titulos: TituloFinanceiroInput[] = [
      { numeroNF: "700", codigoCliente: null, nomeCliente: null, saldoTotal: 100.005 },
    ];
    const cont = new Map([["700", 100.0]]);
    const r = conciliar(titulos, cont, 100.005, 100.0);
    expect(r.divergencias).toEqual([]);
  });

  it("agrega múltiplas parcelas da mesma NF no financeiro", () => {
    const titulos: TituloFinanceiroInput[] = [
      { numeroNF: "800", codigoCliente: "C8", nomeCliente: "P8", saldoTotal: 300 },
      { numeroNF: "800", codigoCliente: "C8", nomeCliente: "P8", saldoTotal: 200 },
    ];
    const cont = new Map([["800", 500]]);
    const r = conciliar(titulos, cont, 500, 500);
    expect(r.divergencias).toEqual([]);
  });

  it("ordena divergências: DIVERGENTE primeiro, SO_CONTABIL, SO_FINANCEIRO, NF_ANTERIOR por último", () => {
    const titulos: TituloFinanceiroInput[] = [
      { numeroNF: "A", codigoCliente: null, nomeCliente: null, saldoTotal: 100 }, // SO_FINANCEIRO
      { numeroNF: "B", codigoCliente: null, nomeCliente: null, saldoTotal: 500 }, // DIVERGENTE
      { numeroNF: "D", codigoCliente: null, nomeCliente: null, saldoTotal: 50 },  // NF_ANTERIOR (saldoCont negativo)
    ];
    const cont = new Map([
      ["B", 200],
      ["C", 700], // SO_CONTABIL
      ["D", -300], // só recebimento — NF criada antes do período contábil
    ]);
    const r = conciliar(titulos, cont, 650, 600);
    expect(r.divergencias.map((d) => [d.numeroNF, d.lado])).toEqual([
      ["B", "DIVERGENTE"],
      ["C", "SO_CONTABIL"],
      ["A", "SO_FINANCEIRO"],
      ["D", "NF_ANTERIOR"],
    ]);
  });

  /**
   * Caso concreto reportado pela Dai (Autron) em 13/05/2026:
   *  - NF 32379 emitida em fev/2026 (R$ 81.000,99 total)
   *  - Recebida parcial em mar/2026 (R$ 40.500,50 — crédito no balancete)
   *  - Financeiro mostra saldo aberto = R$ 40.500,49
   *  - Balancete contábil é só de março → não vê o débito original
   *  - Antes virava DIVERGENTE com diff = R$ 81.000,99 (falso positivo)
   *  - Agora vira NF_ANTERIOR (informativo, não erro real)
   */
  it("NF emitida antes do período contábil (saldo contábil negativo) vira NF_ANTERIOR", () => {
    const titulos: TituloFinanceiroInput[] = [
      {
        numeroNF: "32379",
        codigoCliente: "C009479",
        nomeCliente: "MILETO DISTRIBUIDORA",
        saldoTotal: 40500.49,
      },
    ];
    const cont = new Map([["32379", -40500.5]]); // só vimos o recebimento
    const r = conciliar(titulos, cont, 40500.49, -40500.5);

    expect(r.divergencias).toHaveLength(1);
    expect(r.divergencias[0]).toMatchObject({
      numeroNF: "32379",
      lado: "NF_ANTERIOR",
      saldoFinanceiro: 40500.49,
      saldoContabil: -40500.5,
      diferenca: 81000.99,
    });
    // O total ainda não bate porque o contábil está incompleto — bateuTotalizador
    // permanece false, sinalizando que o usuário deve carregar período maior.
    expect(r.bateuTotalizador).toBe(false);
  });
});

describe.skipIf(!fixturesDisponiveis)("conciliação end-to-end com arquivos reais", () => {
  it("parseia financeiro + contábil e roda conciliação produzindo resultado coerente", async () => {
    const finBuf = readFileSync(join(FIXTURES, "financeiro-cr.xlsx"));
    const contBuf = readFileSync(join(FIXTURES, "contabil-1121010001.xlsx"));

    const fin = await parseFinanceiroCR(finBuf);
    const cont = await parseBalanceteContabil(contBuf);

    const titulos: TituloFinanceiroInput[] = fin.rows.map((t) => ({
      numeroNF: t.numeroNF,
      codigoCliente: t.codigoCliente,
      nomeCliente: t.nomeCliente,
      saldoTotal: t.saldoTotal,
    }));

    const r = conciliar(titulos, cont.saldosPorNF, fin.totalSaldo, cont.saldoFinalCalculado);

    // Sanidade: estrutura existe
    expect(r.totalFinanceiro).toBeGreaterThan(1_000_000);
    expect(r.totalContabil).toBeGreaterThan(1_000_000);
    expect(typeof r.diferencaTotal).toBe("number");
    expect(Array.isArray(r.divergencias)).toBe(true);

    // Caso o cliente reporte total bate, marca bateuTotalizador
    if (Math.abs(r.diferencaTotal) <= 0.01) {
      expect(r.bateuTotalizador).toBe(true);
    } else {
      expect(r.bateuTotalizador).toBe(false);
    }
  });
});
