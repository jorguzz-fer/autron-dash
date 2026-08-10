// src/lib/parsers/comissao/metasPlanilha.test.ts
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseMetasPlanilha } from "./metasPlanilha";

/** Monta a planilha "larga" do RH: # | VENDEDOR | jan..dez (como datas) | TOTAL. */
async function makeWideXlsx(
  linhas: { nome: string; valores: (number | "A DEFINIR")[] }[],
  ano = 2026,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planilha1");
  const meses = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(ano, i, 1)));
  ws.addRow(["#", "VENDEDOR", ...meses, "TOTAL"]);
  linhas.forEach((l, i) => {
    const total = l.valores.reduce<number>((a, v) => a + (typeof v === "number" ? v : 0), 0);
    ws.addRow([i + 1, l.nome, ...l.valores, total || null]);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("parseMetasPlanilha (formato largo por nome)", () => {
  it("lê nome + 12 metas por linha e detecta o ano do cabeçalho", async () => {
    const buf = await makeWideXlsx([
      { nome: "ALEXSIANO", valores: [269953.48, 263300.94, 324909, 353709.35, 378753.22, 262239.63, 431106.47, 323781.82, 241820.65, 512693.94, 342907.07, 294824.42] },
      { nome: "BRUNO", valores: [134976.74, 131650.47, 162454.5, 176854.67, 189376.61, 131119.82, 215553.23, 161890.91, 120910.33, 256346.97, 171453.53, 147412.21] },
    ]);
    const r = await parseMetasPlanilha(buf);
    expect(r.ano).toBe(2026);
    expect(r.linhas.length).toBe(2);
    expect(r.linhas[0].nome).toBe("ALEXSIANO");
    expect(r.linhas[0].valores.length).toBe(12);
    expect(r.linhas[0].valores[0]).toBeCloseTo(269953.48, 2);
    expect(r.linhas[0].valores[11]).toBeCloseTo(294824.42, 2);
    expect(r.linhas[1].nome).toBe("BRUNO");
  });

  it('trata "A DEFINIR" e vazio como null', async () => {
    const buf = await makeWideXlsx([
      { nome: "MATHEUS", valores: ["A DEFINIR", "A DEFINIR", "A DEFINIR", "A DEFINIR", "A DEFINIR", "A DEFINIR", "A DEFINIR", "A DEFINIR", "A DEFINIR", "A DEFINIR", "A DEFINIR", "A DEFINIR"] },
    ]);
    const r = await parseMetasPlanilha(buf);
    expect(r.linhas[0].nome).toBe("MATHEUS");
    expect(r.linhas[0].valores.every((v) => v === null)).toBe(true);
  });

  it("ignora linhas sem nome de vendedor", async () => {
    const buf = await makeWideXlsx([
      { nome: "JOÃO", valores: [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    ]);
    // adiciona uma linha vazia manualmente
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    wb.worksheets[0].addRow([99, null, null]);
    const buf2 = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await parseMetasPlanilha(buf2);
    expect(r.linhas.length).toBe(1);
    expect(r.linhas[0].nome).toBe("JOÃO");
  });
});
