// src/lib/parsers/comissao/metas.test.ts
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseMetasComissao } from "./metas";

/** Constrói um workbook multi-aba no formato real do Protheus (Comissao-Meta.xlsx). */
async function makeMultiSheetXlsx(
  vendedores: { sheet: string; nome: string; codigo: string; ano: number; metas: number[] }[],
  anoParam?: number,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const v of vendedores) {
    const ws = wb.addWorksheet(v.sheet);
    ws.addRow([v.nome]);
    ws.addRow(["VENDEDOR", v.nome]);
    ws.addRow(["CÓDIGO PROTHEUS", v.codigo]);
    ws.addRow([]);
    ws.addRow(["MÊS", ...["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"].map((m) => `${m}-${v.ano}`), "TOTAL"]);
    ws.addRow(["META MES", ...v.metas, v.metas.reduce((a, b) => a + b, 0)]);
    ws.addRow(["GATILHO", ...v.metas.map((m) => m * 0.7)]);
    ws.addRow(["HABILITA COMISSÃO?", "SIM"]);
  }
  if (anoParam) {
    const ws = wb.addWorksheet("PARÂMETROS");
    ws.addRow(["PARÂMETROS"]);
    ws.addRow(["Item", "Conteúdo"]);
    ws.addRow(["Ano Referência", anoParam]);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("parseMetasComissao (multi-aba, formato real)", () => {
  it("extrai código + 12 metas por vendedor e o ano do cabeçalho MÊS", async () => {
    const buf = await makeMultiSheetXlsx([
      {
        sheet: "ADRIANO",
        nome: "ADRIANO CORREA DE MATOS",
        codigo: "000022",
        ano: 2026,
        metas: [303697.67, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
      {
        sheet: "ALEXSIANO",
        nome: "ALEXSIANO PORFIRIO",
        codigo: "000029",
        ano: 2026,
        metas: [269953.48, 263300.94, 324909, 353709.35, 378753.22, 262239.63, 431106.47, 323781.82, 241820.65, 512693.94, 342907.07, 294824.42],
      },
    ], 2026);
    const r = await parseMetasComissao(buf);

    // 2 vendedores × 12 meses
    expect(r.rows.filter((x) => x.codVendedor === "000022").length).toBe(12);
    expect(r.rows.filter((x) => x.codVendedor === "000029").length).toBe(12);

    const adrJan = r.rows.find((x) => x.codVendedor === "000022" && x.mes === 1);
    expect(adrJan?.valorMeta).toBe("303697.67");
    expect(adrJan?.ano).toBe(2026);
    // meses zerados ainda geram linha
    const adrFev = r.rows.find((x) => x.codVendedor === "000022" && x.mes === 2);
    expect(adrFev?.valorMeta).toBe("0");

    // Alexsiano sazonal
    const alxFev = r.rows.find((x) => x.codVendedor === "000029" && x.mes === 2);
    expect(alxFev?.valorMeta).toBe("263300.94");
  });

  it("ignora a aba PARÂMETROS (não vira meta)", async () => {
    const buf = await makeMultiSheetXlsx([
      { sheet: "V1", nome: "FULANO", codigo: "000010", ano: 2026, metas: Array(12).fill(1000) },
    ], 2026);
    const r = await parseMetasComissao(buf);
    expect(new Set(r.rows.map((x) => x.codVendedor))).toEqual(new Set(["000010"]));
    expect(r.rows.length).toBe(12);
  });

  it("zero-padding do código numérico para 6 dígitos (alinha com o analítico)", async () => {
    const buf = await makeMultiSheetXlsx([
      { sheet: "V1", nome: "FULANO", codigo: "22", ano: 2026, metas: Array(12).fill(1000) },
    ]);
    const r = await parseMetasComissao(buf);
    expect(r.rows[0].codVendedor).toBe("000022");
  });
});
