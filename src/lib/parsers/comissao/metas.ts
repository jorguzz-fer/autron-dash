// src/lib/parsers/comissao/metas.ts
import { readExcelWorkbook } from "../excel";
import {
  ParseResult,
  buildHeaderIndex,
  findCol,
  toCleanString,
  toInt,
  toDecimalStr,
} from "../types";

export interface MetaComissaoRow {
  codVendedor: string;
  ano: number;
  mes: number; // 1-12
  valorMeta: string; // Decimal string
}

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

export async function parseMetasComissao(buffer: Buffer): Promise<ParseResult<MetaComissaoRow>> {
  const sheets = await readExcelWorkbook(buffer);
  if (sheets.length === 0) return { rows: [], skipped: 0, warnings: ["arquivo sem abas"] };
  const sheet = sheets[0];
  const allRows = sheet.rows;
  if (allRows.length < 2) return { rows: [], skipped: 0, warnings: ["arquivo sem dados"] };
  const idx = buildHeaderIndex(allRows[0]);

  const cCod = findCol(idx, "CÓDIGO", "CODIGO", "Código", "Codigo Vendedor", "Vendedor", "COD", "Cod. Vendedor");
  const cAno = findCol(idx, "ANO", "Ano", "ano");
  const cMes = MESES.map((m) => findCol(idx, m));

  if (cCod === null) {
    return { rows: [], skipped: 0, warnings: ["coluna CÓDIGO do vendedor ausente"] };
  }

  const anoFallback = new Date().getFullYear();
  const rows: MetaComissaoRow[] = [];
  let skipped = 0;

  for (let r = 1; r < allRows.length; r++) {
    const row = allRows[r];
    const cod = toCleanString(row[cCod]);
    if (!cod) { skipped++; continue; }
    const ano = (cAno !== null ? toInt(row[cAno]) : null) ?? anoFallback;
    for (let m = 0; m < 12; m++) {
      const col = cMes[m];
      if (col === null) continue;
      const valorMeta = toDecimalStr(row[col]) ?? "0";
      rows.push({ codVendedor: cod, ano, mes: m + 1, valorMeta });
    }
  }

  return { rows, skipped, warnings: [] };
}
