import { readExcelRows } from "./excel";
import {
  ParseResult,
  buildHeaderIndex,
  findCol,
  toCleanString,
  toDate,
  toIdString,
} from "./types";

export interface FollowUpRow {
  noSC: string;
  numeroPV: string | null;
  codigoItem: string | null;
  pasta: string | null;
  dtConfirma: Date | null;
  dtPreEntr: Date | null;
  dtChegadaAutron: Date | null;
  noPO: string | null;
  opNaSC: string | null;
  pvInformadoSC: string | null;
}

const HEADER_ROW_INDEX = 1;

export async function parseFollowUp(buffer: Buffer): Promise<ParseResult<FollowUpRow>> {
  const allRows = await readExcelRows(buffer);
  if (allRows.length <= HEADER_ROW_INDEX) {
    return { rows: [], skipped: 0, warnings: ["arquivo vazio ou sem header"] };
  }

  const idx = buildHeaderIndex(allRows[HEADER_ROW_INDEX]);

  const cSC = findCol(idx, "No. da S.C.", "No da SC", "Numero SC", "No SC");
  const cPV = findCol(idx, "Numero do PV", "Numero PV", "PV");
  const cItem = findCol(idx, "Codigo Item", "Cod Item");
  const cPasta = findCol(idx, "Pasta", "Week Fup", "Week FUP", "WeekFup", "Semana Fup", "SemanaFup");
  const cConfirma = findCol(idx, "Dt. Confirma", "Dt Confirma");
  const cPreEntr = findCol(idx, "Dt. Pre entr", "Dt Pre entr", "Dt. Pre Entr");
  const cChegada = findCol(idx, "Dt Chegada Autron", "Dt. Chegada Autron");
  const cPO = findCol(idx, "No. do P.O.", "No do PO", "Numero PO");
  const cOPnaSC = findCol(idx, "OP na SC");
  const cPVnaSC = findCol(idx, "PV informado na SC", "PV na SC");

  if (cSC === null) {
    return { rows: [], skipped: 0, warnings: ["coluna obrigatória ausente: No. da S.C."] };
  }

  const rows: FollowUpRow[] = [];
  let skipped = 0;

  for (let r = HEADER_ROW_INDEX + 1; r < allRows.length; r++) {
    const row = allRows[r];
    const noSC = toIdString(row[cSC]);
    if (!noSC) {
      skipped++;
      continue;
    }

    rows.push({
      noSC,
      numeroPV: cPV !== null ? toIdString(row[cPV]) : null,
      codigoItem: cItem !== null ? toCleanString(row[cItem]) : null,
      pasta: cPasta !== null ? toCleanString(row[cPasta]) : null,
      dtConfirma: cConfirma !== null ? toDate(row[cConfirma]) : null,
      dtPreEntr: cPreEntr !== null ? toDate(row[cPreEntr]) : null,
      dtChegadaAutron: cChegada !== null ? toDate(row[cChegada]) : null,
      noPO: cPO !== null ? toIdString(row[cPO]) : null,
      opNaSC: cOPnaSC !== null ? toIdString(row[cOPnaSC]) : null,
      pvInformadoSC: cPVnaSC !== null ? toIdString(row[cPVnaSC]) : null,
    });
  }

  return { rows, skipped, warnings: [] };
}
