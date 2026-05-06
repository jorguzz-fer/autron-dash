import ExcelJS from "exceljs";

export interface SheetData {
  name: string;
  rows: unknown[][];
}

function rowsFromSheet(ws: ExcelJS.Worksheet): unknown[][] {
  // Itera pelo número total de linhas (incluindo vazias) preservando ordem absoluta —
  // alguns relatórios Protheus deixam linha 1 com espaço em branco, e o índice precisa
  // refletir a posição real no arquivo.
  const out: unknown[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: unknown[] = [];
    const values = row.values as unknown[];
    if (Array.isArray(values)) {
      // exceljs row.values é 1-based (index 0 vazio)
      for (let i = 1; i < values.length; i++) cells.push(values[i]);
    }
    out.push(cells);
  }
  return out;
}

/** Lê todas as abas do workbook, preservando ordem original e linhas vazias. */
export async function readExcelWorkbook(buffer: Buffer): Promise<SheetData[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
  );
  return wb.worksheets.map((ws) => ({ name: ws.name, rows: rowsFromSheet(ws) }));
}

/** Lê a primeira aba do .xlsx (compatibilidade com parsers single-sheet). */
export async function readExcelRows(buffer: Buffer): Promise<unknown[][]> {
  const sheets = await readExcelWorkbook(buffer);
  return sheets[0]?.rows ?? [];
}
