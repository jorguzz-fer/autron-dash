import { readExcelRows } from "./excel";
import {
  ParseResult,
  buildHeaderIndex,
  findCol,
  toCleanString,
  toDecimalStr,
} from "./types";

export interface EstoqueRow {
  codigo: string;
  saldoEstoque: string;
}

// MATA010 tem header na linha 7 (0-based: 6) — linhas anteriores são metadados Protheus
const HEADER_ROW_INDEX = 6;

export async function parseEstoque(buffer: Buffer): Promise<ParseResult<EstoqueRow>> {
  const allRows = await readExcelRows(buffer);
  const warnings: string[] = [];
  if (allRows.length <= HEADER_ROW_INDEX) {
    return { rows: [], skipped: 0, warnings: ["arquivo vazio ou sem header"] };
  }

  // Tenta primeiro o header na linha 7. Se não achar 'CODIGO', tenta linha 1 ou 0
  // (alguns relatórios Protheus saem com offset diferente).
  const candidates = [HEADER_ROW_INDEX, 0, 1, 2, 5, 7];
  let idx: Map<string, number> | null = null;
  let chosenHeaderRow = -1;
  for (const c of candidates) {
    if (c >= allRows.length) continue;
    const m = buildHeaderIndex(allRows[c]);
    if (findCol(m, "Codigo", "Código", "CODIGO") !== null) {
      idx = m;
      chosenHeaderRow = c;
      break;
    }
  }

  if (!idx) {
    return { rows: [], skipped: 0, warnings: ["não encontrou coluna 'Codigo' em nenhuma das linhas candidatas"] };
  }
  if (chosenHeaderRow !== HEADER_ROW_INDEX) {
    warnings.push(`header detectado na linha ${chosenHeaderRow + 1} (esperado: ${HEADER_ROW_INDEX + 1})`);
  }

  const cCodigo = findCol(idx, "Codigo", "Código", "CODIGO")!;
  const cSaldo =
    findCol(idx, "SALDO EM ESTOQUE", "Saldo em Estoque", "Saldo", "SALDO") ?? -1;

  if (cSaldo === -1) {
    return { rows: [], skipped: 0, warnings: ["coluna obrigatória ausente: SALDO EM ESTOQUE"] };
  }

  // Agrupa por código (soma saldos) — protege contra duplicação
  const agg = new Map<string, number>();
  let skipped = 0;
  for (let r = chosenHeaderRow + 1; r < allRows.length; r++) {
    const row = allRows[r];
    const codigo = toCleanString(row[cCodigo]);
    const saldoStr = toDecimalStr(row[cSaldo]);
    if (!codigo || saldoStr === null) {
      skipped++;
      continue;
    }
    const saldo = Number(saldoStr);
    if (!Number.isFinite(saldo)) {
      skipped++;
      continue;
    }
    agg.set(codigo, (agg.get(codigo) ?? 0) + saldo);
  }

  const rows: EstoqueRow[] = Array.from(agg.entries()).map(([codigo, saldo]) => ({
    codigo,
    saldoEstoque: String(saldo),
  }));

  return { rows, skipped, warnings };
}
