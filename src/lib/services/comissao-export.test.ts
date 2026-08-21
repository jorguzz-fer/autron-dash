import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { montarXlsxExtrato } from "./comissao-export";
import type { ExtratoVendedor } from "./comissao";

function extratoFake(): ExtratoVendedor {
  const apuracao = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    meta: 1000,
    gatilho: 700,
    ep: i === 0 ? 1200 : 0,
    saldo: (i === 0 ? 1200 : 0) - 1000,
    saldoAcumulado: 0,
    pctMes: i === 0 ? 1.2 : 0,
    pctAcumulado: i === 0 ? 1.2 : 0.5,
    habilita: i === 0,
    previsao: i === 0 ? 18 : 0,
  }));
  return {
    apuracao,
    pedidosPagos: new Map([["21/01→20/02", [15, ...new Array(11).fill(0)]]]),
    programados: new Map(),
    regra: { comissaoPct: 0.015, gatilhoPct: 0.7 },
    membros: ["000022"],
    aReceber: apuracao.map((m) => m.previsao),
    garantido: null,
  };
}

describe("montarXlsxExtrato", () => {
  it("gera um .xlsx legível com as 3 abas e valores numéricos", async () => {
    const buffer = await montarXlsxExtrato(
      extratoFake(),
      { nome: "ALEXSIANO", cargo: "CONSULTOR DE VENDAS I" },
      "000022",
      2026,
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Apuração", "Programado", "Pagos"]);

    const ws = wb.getWorksheet("Apuração")!;
    // linha 4 = cabeçalho; linha 5 = JAN
    expect(ws.getRow(4).getCell(1).value).toBe("Mês");
    const jan = ws.getRow(5);
    expect(jan.getCell(1).value).toBe("JAN");
    expect(jan.getCell(2).value).toBe(1000); // Meta como número, não texto
    expect(jan.getCell(5).value).toBe(1.2);  // % mês como fração (formato % na célula)
    expect(jan.getCell(9).value).toBe("SIM");
    // linha 17 = TOTAL (4 + 12 meses + 1)
    expect(ws.getRow(17).getCell(1).value).toBe("TOTAL");
    expect(ws.getRow(17).getCell(4).value).toBe(1200);

    const pagos = wb.getWorksheet("Pagos")!;
    expect(pagos.getRow(4).getCell(1).value).toBe("21/01→20/02");
    expect(pagos.getRow(4).getCell(14).value).toBe(15); // Total da janela
  });
});
