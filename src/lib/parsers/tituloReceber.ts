import { readExcelWorkbook } from "./excel";
import {
  buildHeaderIndex,
  findCol,
  normalizeHeader,
  toCleanString,
  toDate,
  toDecimalStr,
  toInt,
  type ParseResult,
} from "./types";
import {
  parseCodigoCliente,
  parseNumeroTitulo,
  parseParcela,
} from "./conciliacao/financeiro";

/**
 * Uma linha do relatório "Posição dos Títulos" (FINR130) do Protheus — a
 * posição de Contas a Receber. Reaproveita os parsers de campos compostos do
 * módulo de Conciliação (mesmo arquivo-fonte), mas grava num dataset próprio
 * (`TITULO_RECEBER`) usado pela seção KPI Financeiro.
 *
 * Estrutura do arquivo:
 *  - Aba "Parametros" — Dt.Ref e filtros do relatório.
 *  - Aba "NN-NNNNN - Posicao dos Titulos" — uma linha por título/parcela,
 *    com o cabeçalho repetido a cada quebra de página (ignoramos as repetições).
 */
export interface TituloReceberRow {
  codigoCliente: string | null;
  loja: string | null;
  nomeCliente: string | null;
  numeroNF: string;
  parcela: string | null;
  tipo: string | null;
  natureza: string | null;
  dataEmissao: Date | null;
  vencimento: Date | null;
  valorOriginal: string | null; // Decimal serializado como string p/ Prisma
  saldoVencido: string; // "0" quando a vencer
  saldoAVencer: string; // "0" quando vencido
  diasAtraso: number;
  historico: string | null;
  dataReferencia: Date | null;
}

function extractDataReferencia(parametrosRows: unknown[][]): Date | null {
  for (const row of parametrosRows) {
    const label = normalizeHeader(toCleanString(row?.[0]));
    // "Dt.Ref: 22/06/2026" — a data pode vir na MESMA célula (após ":") ou na
    // célula ao lado. Tentamos os dois.
    if (label.startsWith("dtref") || label.includes("database")) {
      const ladoB = toDate(row?.[1]);
      if (ladoB) return ladoB;
      const raw = toCleanString(row?.[0]);
      if (raw) {
        const m = /(\d{1,2}\/\d{1,2}\/\d{2,4})/.exec(raw);
        if (m) {
          const d = toDate(m[1]);
          if (d) return d;
        }
      }
    }
  }
  return null;
}

function pickTitulosSheet(
  sheets: { name: string; rows: unknown[][] }[],
): { name: string; rows: unknown[][] } | null {
  const byName = sheets.find((s) =>
    normalizeHeader(s.name).includes("posicaodostitulos"),
  );
  if (byName) return byName;
  return (
    sheets.find(
      (s) => !normalizeHeader(s.name).includes("parametro") && s.rows.length > 3,
    ) ?? null
  );
}

const HEADER_MARKERS = [
  "prfnumeroparcela",
  "codigoljnome",
  "titvencidosvaloratual",
  "titulosavencervaloratual",
  "venctotitulo",
];

function isHeaderRow(row: unknown[] | undefined): boolean {
  if (!row) return false;
  const flat = row.map((c) => normalizeHeader(toCleanString(c))).join("|");
  return HEADER_MARKERS.some((m) => flat.includes(m));
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    if (isHeaderRow(rows[i])) return i;
  }
  return -1;
}

function toNumberStr(v: unknown): string {
  const s = toDecimalStr(v);
  if (s == null) return "0";
  const n = Number(s);
  return Number.isFinite(n) ? String(n) : "0";
}

/**
 * Parser do relatório de Títulos a Receber (FINR130 / "Posição dos Títulos").
 * Cada linha vira um `TituloReceberRow`. O cabeçalho repetido por página é
 * ignorado (detectado pelos mesmos marcadores do header).
 */
export async function parseTituloReceber(
  buffer: Buffer,
): Promise<ParseResult<TituloReceberRow>> {
  const sheets = await readExcelWorkbook(buffer);
  if (sheets.length === 0) {
    return { rows: [], skipped: 0, warnings: ["Arquivo Excel vazio."] };
  }

  const parametros = sheets.find((s) =>
    normalizeHeader(s.name).includes("parametro"),
  );
  const dataReferencia = parametros
    ? extractDataReferencia(parametros.rows)
    : null;

  const sheet = pickTitulosSheet(sheets);
  if (!sheet) {
    return {
      rows: [],
      skipped: 0,
      warnings: [
        "Não encontrei a aba 'Posicao dos Titulos' no arquivo. Exporte o " +
          "relatório de Posição de Títulos a Receber (FINR130) do Protheus.",
      ],
    };
  }

  const headerRowIdx = findHeaderRow(sheet.rows);
  if (headerRowIdx === -1) {
    return {
      rows: [],
      skipped: 0,
      warnings: [
        "Cabeçalho da aba de títulos não encontrado. Esperado colunas como " +
          "'Codigo-Lj-Nome do Cliente', 'Prf-Numero Parcela', 'Tit Vencidos " +
          "Valor Atual' e 'Titulos a Vencer Valor Atual'.",
      ],
    };
  }

  const idx = buildHeaderIndex(sheet.rows[headerRowIdx]!);
  const cCliente = findCol(
    idx,
    "Codigo-Lj-Nome do Cliente",
    "Codigo Lj Nome do Cliente",
    "Cliente",
  );
  const cTitulo = findCol(
    idx,
    "Prf-Numero Parcela",
    "Prf Numero Parcela",
    "Pref-Numero Parcela",
    "Numero Titulo",
    "Titulo",
  );
  const cTipo = findCol(idx, "TP", "Tipo");
  const cNatureza = findCol(idx, "Natureza");
  const cEmissao = findCol(idx, "Data de Emissao", "Emissao", "Dt Emissao");
  const cVencto = findCol(
    idx,
    "Vencto Real",
    "Vencimento Real",
    "Vencto Titulo",
    "Vencimento",
  );
  const cValorOriginal = findCol(idx, "Valor Original", "Vlr Original");
  const cVencidos = findCol(
    idx,
    "Tit Vencidos Valor Atual",
    "Vencidos Valor Atual",
  );
  const cAVencer = findCol(
    idx,
    "Titulos a Vencer Valor Atual",
    "A Vencer Valor Atual",
    "Titulos a Vencer",
  );
  const cDiasAtraso = findCol(idx, "Dias Atraso", "Dias de Atraso");
  const cHistorico = findCol(idx, "Historico");

  if (cTitulo === null || (cVencidos === null && cAVencer === null)) {
    return {
      rows: [],
      skipped: 0,
      warnings: [
        "Colunas essenciais não encontradas (número do título e/ou saldos " +
          "Vencidos/A Vencer). Verifique se o relatório é a 'Posição de " +
          "Títulos a Receber' (FINR130) do Protheus.",
      ],
    };
  }

  const rows: TituloReceberRow[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (let r = headerRowIdx + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (!row || row.every((c) => c == null || c === "")) continue;
    // Cabeçalho repetido a cada quebra de página do Protheus.
    if (isHeaderRow(row)) continue;

    const tituloRaw = toCleanString(row[cTitulo]) ?? "";
    const numeroNF = parseNumeroTitulo(tituloRaw);
    if (!numeroNF) {
      // Linhas de subtotal/total ou em branco no meio do relatório.
      skipped++;
      continue;
    }

    const clienteRaw = cCliente !== null ? toCleanString(row[cCliente]) : null;
    const { codigo, loja, nome } = parseCodigoCliente(clienteRaw);

    rows.push({
      codigoCliente: codigo,
      loja,
      nomeCliente: nome,
      numeroNF,
      parcela: parseParcela(tituloRaw),
      tipo: cTipo !== null ? toCleanString(row[cTipo]) : null,
      natureza: cNatureza !== null ? toCleanString(row[cNatureza]) : null,
      dataEmissao: cEmissao !== null ? toDate(row[cEmissao]) : null,
      vencimento: cVencto !== null ? toDate(row[cVencto]) : null,
      valorOriginal: cValorOriginal !== null ? toDecimalStr(row[cValorOriginal]) : null,
      saldoVencido: cVencidos !== null ? toNumberStr(row[cVencidos]) : "0",
      saldoAVencer: cAVencer !== null ? toNumberStr(row[cAVencer]) : "0",
      diasAtraso: (cDiasAtraso !== null ? toInt(row[cDiasAtraso]) : 0) ?? 0,
      historico: cHistorico !== null ? toCleanString(row[cHistorico]) : null,
      dataReferencia,
    });
  }

  if (rows.length === 0) {
    warnings.push(
      "Nenhum título reconhecido na aba — confira se o arquivo é o relatório " +
        "de Posição de Títulos a Receber (FINR130).",
    );
  }

  return { rows, skipped, warnings };
}
