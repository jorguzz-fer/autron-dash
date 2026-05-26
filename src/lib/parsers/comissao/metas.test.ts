// src/lib/parsers/comissao/metas.test.ts
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseMetasComissao } from "./metas";

async function makeXlsx(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Metas");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("parseMetasComissao", () => {
  it("expande vendedor x 12 meses em linhas (codVendedor, ano, mes, valorMeta)", async () => {
    const buf = await makeXlsx([
      ["CÓDIGO", "ANO", "JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"],
      ["000022", 2026, 100000, 120000, 150000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    const r = await parseMetasComissao(buf);
    const jan = r.rows.find((x) => x.codVendedor === "000022" && x.mes === 1);
    const fev = r.rows.find((x) => x.codVendedor === "000022" && x.mes === 2);
    expect(jan?.valorMeta).toBe("100000");
    expect(fev?.valorMeta).toBe("120000");
    expect(jan?.ano).toBe(2026);
    // meses com 0 ainda geram linha (meta zero) — ok
    expect(r.rows.filter((x) => x.codVendedor === "000022").length).toBe(12);
  });

  it("usa ano corrente como fallback quando coluna ANO ausente", async () => {
    const currentYear = new Date().getFullYear();
    const buf = await makeXlsx([
      ["CÓDIGO", "JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"],
      ["000029", 50000, 60000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ]);
    const r = await parseMetasComissao(buf);
    expect(r.rows[0].ano).toBe(currentYear);
  });
});
