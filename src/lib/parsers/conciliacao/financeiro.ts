import { readExcelWorkbook } from "../excel";
import {
  buildHeaderIndex,
  findCol,
  normalizeHeader,
  toCleanString,
  toDate,
  toDecimalStr,
  type ParseResult,
} from "../types";

/**
 * Uma linha do "Relatório Financeiro CR" — Posição de Títulos a Receber do Protheus.
 *
 * Estrutura típica do arquivo:
 *  - Aba "Parametros" — perguntas do relatório (data referência, filtros, etc.)
 *  - Aba "01-01001 - Posicao dos Titulos" (ou nome similar) — lista de títulos
 *
 * Cada linha = 1 título a receber em aberto na data de referência.
 * NF é a chave de matching com o lado contábil.
 */
export interface TituloFinanceiro {
  /** NF sem zeros à esquerda — ex: "32433". Vazio quando não dá pra extrair (raro). */
  numeroNF: string;
  /** Código Protheus do cliente — ex: "C000297". */
  codigoCliente: string | null;
  /** Loja — ex: "01". */
  loja: string | null;
  /** Nome do cliente — ex: "3M - SUMARE". */
  nomeCliente: string | null;
  /** Tipo do título: "NF", "RA" (recibo adiantamento), etc. */
  tipo: string | null;
  /** Prefixo + número bruto extraído da coluna (ex: "2  -000032433-"). */
  numeroTituloRaw: string;
  dataEmissao: Date | null;
  vencimento: Date | null;
  /** Valor original do título (não líquido de pagamentos). */
  valorOriginal: number;
  /** Saldo restante de títulos vencidos (à data de referência). */
  saldoVencidos: number;
  /** Saldo restante de títulos a vencer. */
  saldoAVencer: number;
  /** Saldo total a receber dessa linha = vencidos + a vencer. */
  saldoTotal: number;
}

export interface FinanceiroParsed {
  /** Data de referência do relatório (Dt.Ref da aba Parametros). */
  dataReferencia: Date | null;
  titulos: TituloFinanceiro[];
  /** Soma de saldoTotal de todos os títulos. Casa com o "Total" do balancete. */
  totalSaldo: number;
}

/**
 * Extrai NF do campo "Prf-Numero Parcela" do Protheus.
 *
 * Formatos suportados:
 *  - "2  -000032433-"      → "32433"  (NF normal, padded com zeros)
 *  - "2  -000032464-2"     → "32464"  (com parcela)
 *  - "RPS-000000624-"      → "624"    (recibo prestação serviço)
 *  - "RA -000120326-"      → "120326" (recibo adiantamento — valor negativo)
 *
 * Estratégia: pega o primeiro grupo de dígitos com 5+ caracteres dentro da string,
 * separado por hífens. Strip leading zeros.
 */
export function parseNumeroTitulo(raw: string | null | undefined): string {
  if (!raw) return "";
  // Captura o trecho entre o primeiro e o segundo hífen.
  const m = /-\s*(\d+)\s*-/.exec(raw);
  if (!m) return "";
  const digits = m[1].replace(/^0+/, "");
  return digits || "0";
}

/**
 * Parse do campo composto "C000297-01-3M - SUMARE" → { codigo, loja, nome }.
 * O nome pode conter hífens próprios (ex: "ARCELORMITTAL- JOAO"), então usamos
 * regex ancorado para capturar exatamente "C\d+-(\d{2,})-(resto)".
 */
export function parseCodigoCliente(raw: string | null | undefined): {
  codigo: string | null;
  loja: string | null;
  nome: string | null;
} {
  if (!raw) return { codigo: null, loja: null, nome: null };
  const m = /^([A-Z]?\d+)-(\d+)-(.*)$/.exec(raw.trim());
  if (!m) return { codigo: null, loja: null, nome: raw.trim() };
  return { codigo: m[1], loja: m[2], nome: m[3].trim() };
}

/** Encontra a aba que contém a lista de títulos (procura "Posicao dos Titulos" no nome). */
function pickTitulosSheet(sheets: { name: string; rows: unknown[][] }[]): { name: string; rows: unknown[][] } | null {
  const normalized = sheets.find((s) =>
    normalizeHeader(s.name).includes("posicaodostitulos"),
  );
  if (normalized) return normalized;
  // Fallback: pega a aba que NÃO é "Parametros" e tem dados.
  return (
    sheets.find((s) => !normalizeHeader(s.name).includes("parametro") && s.rows.length > 3) ?? null
  );
}

function findHeaderRow(rows: unknown[][]): number {
  // Header costuma estar na linha 1 (índice 0). Mas se houver título antes,
  // procuramos uma linha que tenha "Codigo" ou "Cliente" em alguma célula.
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;
    const flat = row.map((c) => normalizeHeader(toCleanString(c))).join("|");
    if (flat.includes("clienteprefnumero") || flat.includes("codigoljnome") || flat.includes("nomedocliente")) {
      return i;
    }
  }
  return 0;
}

function extractDataReferencia(parametrosRows: unknown[][]): Date | null {
  // Procura por uma linha onde a primeira célula contém "Dt.Ref" ou "Data Base"
  for (const row of parametrosRows) {
    const label = normalizeHeader(toCleanString(row?.[0]));
    if (label.includes("dtref") || label.includes("database")) {
      const dt = toDate(row?.[1]);
      if (dt) return dt;
    }
  }
  return null;
}

function toNumber(v: unknown): number {
  const s = toDecimalStr(v);
  if (s == null) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parser principal do Relatório Financeiro CR (Contas a Receber).
 *
 * @param buffer Conteúdo .xlsx
 * @returns Resultado com títulos parseados, total, warnings de linhas ignoradas.
 */
export async function parseFinanceiroCR(buffer: Buffer): Promise<ParseResult<TituloFinanceiro> & { totalSaldo: number; dataReferencia: Date | null }> {
  const sheets = await readExcelWorkbook(buffer);
  if (sheets.length === 0) {
    return { rows: [], skipped: 0, warnings: ["Arquivo Excel vazio."], totalSaldo: 0, dataReferencia: null };
  }

  const parametros = sheets.find((s) => normalizeHeader(s.name).includes("parametro"));
  const dataReferencia = parametros ? extractDataReferencia(parametros.rows) : null;

  const titulosSheet = pickTitulosSheet(sheets);
  if (!titulosSheet) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["Não encontrei a aba 'Posicao dos Titulos' no arquivo."],
      totalSaldo: 0,
      dataReferencia,
    };
  }

  const headerRowIdx = findHeaderRow(titulosSheet.rows);
  const headerRow = titulosSheet.rows[headerRowIdx];
  if (!headerRow) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["Header da aba de títulos não encontrado."],
      totalSaldo: 0,
      dataReferencia,
    };
  }

  const idx = buildHeaderIndex(headerRow);
  const cCliente = findCol(idx, "Codigo-Lj-Nome do Cliente", "Codigo Cliente", "Cliente");
  const cTitulo = findCol(idx, "Prf-Numero Parcela", "Numero Titulo", "Titulo");
  const cTipo = findCol(idx, "TP", "Tipo");
  const cDataEmissao = findCol(idx, "Data de Emissao", "Emissao");
  const cVencto = findCol(idx, "Vencto Real", "Vencimento", "Vencto Titulo");
  const cValorOriginal = findCol(idx, "Valor Original", "Vlr Original");
  const cSaldoVencidos = findCol(idx, "Tit Vencidos Valor Atual", "Vencidos Valor Atual");
  const cSaldoAVencer = findCol(idx, "Titulos a Vencer Valor Atual", "A Vencer Valor Atual");

  if (cTitulo === null) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["Coluna 'Prf-Numero Parcela' não encontrada."],
      totalSaldo: 0,
      dataReferencia,
    };
  }

  const rows: TituloFinanceiro[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  let totalSaldo = 0;

  for (let r = headerRowIdx + 1; r < titulosSheet.rows.length; r++) {
    const row = titulosSheet.rows[r];
    if (!row || row.every((c) => c == null || c === "")) continue;

    const tituloRaw = toCleanString(row[cTitulo]) ?? "";
    const nf = parseNumeroTitulo(tituloRaw);
    if (!nf) {
      // Linhas de totalizador, em branco no meio, etc.
      skipped++;
      continue;
    }

    const clienteRaw = cCliente !== null ? toCleanString(row[cCliente]) : null;
    const { codigo, loja, nome } = parseCodigoCliente(clienteRaw);

    const saldoVencidos = cSaldoVencidos !== null ? toNumber(row[cSaldoVencidos]) : 0;
    const saldoAVencer = cSaldoAVencer !== null ? toNumber(row[cSaldoAVencer]) : 0;
    const saldoTotal = saldoVencidos + saldoAVencer;

    rows.push({
      numeroNF: nf,
      codigoCliente: codigo,
      loja,
      nomeCliente: nome,
      tipo: cTipo !== null ? toCleanString(row[cTipo]) : null,
      numeroTituloRaw: tituloRaw,
      dataEmissao: cDataEmissao !== null ? toDate(row[cDataEmissao]) : null,
      vencimento: cVencto !== null ? toDate(row[cVencto]) : null,
      valorOriginal: cValorOriginal !== null ? toNumber(row[cValorOriginal]) : 0,
      saldoVencidos,
      saldoAVencer,
      saldoTotal,
    });

    totalSaldo += saldoTotal;
  }

  return { rows, skipped, warnings, totalSaldo, dataReferencia };
}
