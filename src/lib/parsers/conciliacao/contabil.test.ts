import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBalanceteContabil, parseHistorico } from "./contabil";

const FIXTURES = join(__dirname, "__fixtures__");
const FIXTURE_CONTABIL = join(FIXTURES, "contabil-1121010001.xlsx");
/** Fixtures com dados reais — não commitados. Veja financeiro.test.ts pra contexto. */
const fixturesDisponiveis = existsSync(FIXTURE_CONTABIL);

describe("parseHistorico", () => {
  it("identifica CRIACAO_NF", () => {
    expect(parseHistorico("NF 000032416 - KOCH DO BRASIL")).toEqual({
      numeroNF: "32416",
      cliente: "KOCH DO BRASIL",
      tipo: "CRIACAO_NF",
    });
  });

  it("identifica RECEBIMENTO via 'REC. NF.'", () => {
    expect(parseHistorico("REC. NF. 000032162 COMPANHIA S")).toEqual({
      numeroNF: "32162",
      cliente: "COMPANHIA S",
      tipo: "RECEBIMENTO",
    });
  });

  it("identifica RECEBIMENTO via 'RECEBIMENT. NF.'", () => {
    expect(parseHistorico("RECEBIMENT. NF. 000032291 KARI")).toEqual({
      numeroNF: "32291",
      cliente: "KARI",
      tipo: "RECEBIMENTO",
    });
  });

  it("identifica RA", () => {
    expect(parseHistorico("RA 000120326-")).toEqual({
      numeroNF: null,
      cliente: null,
      tipo: "RA",
    });
  });

  it("identifica RA_COMP", () => {
    expect(parseHistorico("COMP RA .NR.RA 000040326-")).toEqual({
      numeroNF: null,
      cliente: null,
      tipo: "RA_COMP",
    });
  });

  it("retorna OUTRO pra entrada não reconhecida", () => {
    expect(parseHistorico("alguma coisa estranha")).toEqual({
      numeroNF: null,
      cliente: null,
      tipo: "OUTRO",
    });
  });

  it("retorna OUTRO pra null/empty", () => {
    expect(parseHistorico(null)).toEqual({ numeroNF: null, cliente: null, tipo: "OUTRO" });
    expect(parseHistorico("")).toEqual({ numeroNF: null, cliente: null, tipo: "OUTRO" });
  });
});

describe("parseBalanceteContabil — detecção de balancete da conta errada", () => {
  it("avisa quando 10+ lançamentos mas nenhuma NF reconhecida (conta Banco/Caixa)", async () => {
    const xlsx = await import("xlsx");
    const wb = xlsx.utils.book_new();

    // Aba Parametros (vazia mas precisa existir)
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([["Parametros"]]), "Parametros");

    // Aba Conta dizendo que é a conta Banco
    xlsx.utils.book_append_sheet(
      wb,
      xlsx.utils.aoa_to_sheet([
        ["CONTA", "DESCRICAO"],
        ["1.1.1.10.2", "- BANCOS CTA. MOVIMENTO"],
      ]),
      "Conta",
    );

    // 10 lançamentos com histórico que NÃO casa nenhum padrão de NF (PGTO de fornecedor)
    const linhas: unknown[][] = [["DATA", "HISTORICO", "DEBITO", "CREDITO", "SALDO ATUAL"]];
    for (let i = 0; i < 12; i++) {
      linhas.push([
        "2026-03-01",
        `PGTO NF - SPOHN NF IMP: 0000${i.toString().padStart(5, "0")} P: W`,
        1000,
        0,
        "0,00 D",
      ]);
    }
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(linhas), "3-Lançamentos Contábeis");

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const r = await parseBalanceteContabil(buf);

    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/nenhuma NF de cliente recon/i);
    expect(r.warnings[0]).toMatch(/Clientes Nacionais/i);
    expect(r.warnings[0]).toMatch(/1\.1\.1\.10\.2/);
    expect(r.warnings[0]).toMatch(/BANCOS/i);
  });
});

describe("parseBalanceteContabil — detecção de arquivo trocado", () => {
  it("detecta financeiro CR no campo contábil (aba 'Posicao dos Titulos')", async () => {
    const xlsx = await import("xlsx");
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet([
      ["Codigo-Lj-Nome do Cliente", "Prf-Numero Parcela", "TP", "Valor Original"],
      ["C000297-01-3M", "2  -000032433-", "NF", 1000],
    ]);
    xlsx.utils.book_append_sheet(wb, ws, "01-01001 - Posicao dos Titulos");
    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const r = await parseBalanceteContabil(buf);
    expect(r.rows).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/Relat[óo]rio Financeiro/i);
    expect(r.warnings[0]).toMatch(/troc(ou|ado)/i);
  });
});

describe.skipIf(!fixturesDisponiveis)("parseBalanceteContabil (fixture real)", () => {
  it("parseia o balancete completo sem erros", async () => {
    const buffer = readFileSync(join(FIXTURES, "contabil-1121010001.xlsx"));
    const result = await parseBalanceteContabil(buffer);

    expect(result.warnings).toEqual([]);
    expect(result.rows.length).toBeGreaterThan(100);
  });

  it("extrai a conta contábil e descrição", async () => {
    const buffer = readFileSync(join(FIXTURES, "contabil-1121010001.xlsx"));
    const result = await parseBalanceteContabil(buffer);
    expect(result.contaContabil).toBe("1.1.2.10.1");
    expect(result.descricaoConta).toMatch(/CLIENTES/i);
  });

  it("extrai data início/fim do parametros (01/03/2026 a 31/03/2026)", async () => {
    const buffer = readFileSync(join(FIXTURES, "contabil-1121010001.xlsx"));
    const result = await parseBalanceteContabil(buffer);
    expect(result.dataInicio?.getUTCFullYear()).toBe(2026);
    expect(result.dataInicio?.getUTCMonth()).toBe(2); // março = 2
    expect(result.dataInicio?.getUTCDate()).toBe(1);
    expect(result.dataFim?.getUTCDate()).toBe(31);
  });

  it("identifica criações de NF e recebimentos no balancete", async () => {
    const buffer = readFileSync(join(FIXTURES, "contabil-1121010001.xlsx"));
    const result = await parseBalanceteContabil(buffer);

    const criacoes = result.rows.filter((r) => r.tipoLancamento === "CRIACAO_NF");
    const recebimentos = result.rows.filter((r) => r.tipoLancamento === "RECEBIMENTO");
    expect(criacoes.length).toBeGreaterThan(10);
    expect(recebimentos.length).toBeGreaterThan(10);
  });

  it("encontra criação da NF 32416 (KOCH) com débito ~272.291,51", async () => {
    const buffer = readFileSync(join(FIXTURES, "contabil-1121010001.xlsx"));
    const result = await parseBalanceteContabil(buffer);
    const koch = result.rows.find(
      (r) => r.numeroNF === "32416" && r.tipoLancamento === "CRIACAO_NF",
    );
    expect(koch).toBeDefined();
    expect(koch!.debito).toBeCloseTo(272291.51, 2);
    expect(koch!.credito).toBe(0);
    expect(koch!.cliente).toMatch(/KOCH/);
  });

  it("constrói mapa saldosPorNF com a NF 32416", async () => {
    const buffer = readFileSync(join(FIXTURES, "contabil-1121010001.xlsx"));
    const result = await parseBalanceteContabil(buffer);
    expect(result.saldosPorNF.has("32416")).toBe(true);
  });

  it("soma de saldosPorNF + (createsSemNF) = totalDebito − totalCredito", async () => {
    const buffer = readFileSync(join(FIXTURES, "contabil-1121010001.xlsx"));
    const result = await parseBalanceteContabil(buffer);
    const sumNF = Array.from(result.saldosPorNF.values()).reduce((a, v) => a + v, 0);
    // Lançamentos sem NF (RA / OUTRO) somam separadamente
    const debSemNF = result.rows
      .filter((r) => !r.numeroNF)
      .reduce((a, r) => a + r.debito - r.credito, 0);
    expect(Math.abs(sumNF + debSemNF - (result.totalDebitoPeriodo - result.totalCreditoPeriodo))).toBeLessThan(0.05);
  });

  it("saldoFinalCalculado = saldoAnterior + totalDebito - totalCredito", async () => {
    const buffer = readFileSync(join(FIXTURES, "contabil-1121010001.xlsx"));
    const result = await parseBalanceteContabil(buffer);
    const esperado = result.saldoAnterior + result.totalDebitoPeriodo - result.totalCreditoPeriodo;
    expect(Math.abs(result.saldoFinalCalculado - esperado)).toBeLessThan(0.01);
  });
});
