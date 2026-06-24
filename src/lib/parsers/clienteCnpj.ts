import Papa from "papaparse";
import { readExcelWorkbook, type SheetData } from "./excel";
import { buildHeaderIndex, findCol, toCleanString, type ParseResult } from "./types";
import { classifyDoc, type DocTipo } from "@/lib/domain/cnpj";

/**
 * Parser da planilha de cadastros para enriquecimento por CNPJ.
 *
 * Formato esperado (export Protheus — uma ou mais abas, ex.: "Clientes" e
 * "Fornecedores"), cabeçalho na primeira linha de cada aba:
 *   Codigo | Loja | Nome (ou Razao Social) | N Fantasia | CNPJ/CPF
 *
 * Cada aba reconhecível (que tenha coluna de CNPJ/CPF) é importada; a aba de
 * origem é registrada em `origem`. Linhas sem documento são ignoradas
 * (contam em `skipped`); CPF e CNPJ com DV inválido são MANTIDOS (o usuário
 * quer vê-los na tabela) e marcados pelo `tipoDoc`/`valido` para virar SKIPPED
 * no enriquecimento.
 */
export interface ClienteCnpjRow {
  rowIndex: number;
  origem: string | null;
  inputCodigo: string | null;
  inputLoja: string | null;
  inputName: string | null;
  inputNomeFantasia: string | null;
  cnpj: string; // dígitos normalizados
  tipoDoc: DocTipo;
  valido: boolean;
}

const CNPJ_HEADERS = ["CNPJ/CPF", "CNPJ", "CPF/CNPJ", "CNPJ / CPF", "CPF", "Documento"];
const NOME_HEADERS = ["Nome", "Razao Social", "Razão Social", "Cliente", "Fornecedor", "Nome Cliente", "Razao"];
const FANTASIA_HEADERS = ["N Fantasia", "Nome Fantasia", "Fantasia", "Nome Fantasía"];
const CODIGO_HEADERS = ["Codigo", "Código", "Cod", "Cod Cliente", "Codigo Cliente"];
const LOJA_HEADERS = ["Loja"];

interface ColIdx {
  cnpj: number;
  nome: number | null;
  fantasia: number | null;
  codigo: number | null;
  loja: number | null;
}

/** Procura a linha de cabeçalho (até as 10 primeiras) com uma coluna de CNPJ. */
function findHeader(rows: unknown[][]): { headerRowIdx: number; cols: ColIdx } | null {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const idx = buildHeaderIndex(rows[i] ?? []);
    const cnpj = findCol(idx, ...CNPJ_HEADERS);
    if (cnpj === null) continue;
    return {
      headerRowIdx: i,
      cols: {
        cnpj,
        nome: findCol(idx, ...NOME_HEADERS),
        fantasia: findCol(idx, ...FANTASIA_HEADERS),
        codigo: findCol(idx, ...CODIGO_HEADERS),
        loja: findCol(idx, ...LOJA_HEADERS),
      },
    };
  }
  return null;
}

function processSheet(
  sheet: SheetData,
  startIndex: number,
  rows: ClienteCnpjRow[],
): { skipped: number; warning?: string } {
  const found = findHeader(sheet.rows);
  if (!found) {
    return { skipped: 0, warning: `aba "${sheet.name}" ignorada (sem coluna de CNPJ/CPF)` };
  }
  const { headerRowIdx, cols } = found;
  let skipped = 0;

  for (let r = headerRowIdx + 1; r < sheet.rows.length; r++) {
    const row = sheet.rows[r];
    if (!row || row.every((c) => c == null || c === "")) continue;

    const docRaw = toCleanString(row[cols.cnpj]);
    const doc = classifyDoc(docRaw);
    if (doc.tipo === "INVALIDO" && doc.digits === "") {
      skipped++; // linha sem documento algum (subtotal, rodapé, etc.)
      continue;
    }

    rows.push({
      rowIndex: startIndex + rows.length,
      origem: sheet.name,
      inputCodigo: cols.codigo !== null ? toCleanString(row[cols.codigo]) : null,
      inputLoja: cols.loja !== null ? toCleanString(row[cols.loja]) : null,
      inputName: cols.nome !== null ? toCleanString(row[cols.nome]) : null,
      inputNomeFantasia: cols.fantasia !== null ? toCleanString(row[cols.fantasia]) : null,
      cnpj: doc.digits,
      tipoDoc: doc.tipo,
      valido: doc.valido,
    });
  }
  return { skipped };
}

/** Converte um CSV (header:false) em uma "aba" única no formato matriz. */
function csvToSheet(buffer: Buffer): SheetData {
  // Tenta utf-8; cai para latin1 se vier com caracteres de substituição.
  let text = new TextDecoder("utf-8").decode(buffer);
  if (text.includes("�")) text = new TextDecoder("latin1").decode(buffer);
  const delimiter = (text.split("\n")[0]?.includes(";") ? ";" : ",");
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true, delimiter });
  return { name: "CSV", rows: parsed.data as unknown[][] };
}

export async function parseClientesCnpj(
  buffer: Buffer,
  opts?: { filename?: string },
): Promise<ParseResult<ClienteCnpjRow>> {
  const isCsv = opts?.filename?.toLowerCase().endsWith(".csv");
  let sheets: SheetData[];

  if (isCsv) {
    sheets = [csvToSheet(buffer)];
  } else {
    try {
      sheets = await readExcelWorkbook(buffer);
    } catch {
      sheets = [csvToSheet(buffer)]; // fallback se não for um xlsx válido
    }
  }

  const rows: ClienteCnpjRow[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  for (const sheet of sheets) {
    const res = processSheet(sheet, 0, rows);
    skipped += res.skipped;
    if (res.warning) warnings.push(res.warning);
  }

  if (rows.length === 0) {
    warnings.push(
      "Nenhuma linha com CNPJ/CPF reconhecida. Esperado uma planilha com coluna " +
        "'CNPJ/CPF' e, idealmente, 'Nome'/'Razao Social' e 'Codigo'.",
    );
  }

  return { rows, skipped, warnings };
}
