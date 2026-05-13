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
 * Tipos de lançamento identificáveis no campo HISTORICO do balancete Protheus.
 *
 *  - CRIACAO_NF: lançamento de criação de título — "NF 000032416 - KOCH ..."
 *    Sempre tem débito (aumenta o saldo da conta Clientes).
 *
 *  - RECEBIMENTO: pagamento total/parcial — "REC. NF. 000032162 ..." ou
 *    "RECEBIMENT. NF. 000032291 ...".
 *    Sempre tem crédito (reduz o saldo da conta Clientes).
 *
 *  - RA / RA_COMP: adiantamentos (recibo de adiantamento) — sem NF associada.
 *
 *  - OUTRO: lançamento que o parser não conseguiu classificar.
 */
export type TipoLancamento = "CRIACAO_NF" | "RECEBIMENTO" | "RA" | "RA_COMP" | "OUTRO";

export interface LancamentoContabil {
  data: Date | null;
  /** Texto bruto do campo HISTORICO. */
  historico: string;
  /** NF extraída do histórico — null pra RA/OUTRO. Sem zeros à esquerda. */
  numeroNF: string | null;
  /** Cliente extraído do histórico (parte depois do número da NF). */
  cliente: string | null;
  debito: number;
  credito: number;
  saldoAtual: number;
  tipoLancamento: TipoLancamento;
}

export interface ContabilParsed {
  /** Número da conta — ex: "1121010001". */
  contaContabil: string | null;
  /** Descrição da conta — ex: "CLIENTES". */
  descricaoConta: string | null;
  /** Saldo da conta no fechamento do período anterior. */
  saldoAnterior: number;
  dataInicio: Date | null;
  dataFim: Date | null;
  lancamentos: LancamentoContabil[];
  /**
   * Mapa NF → saldo restante apenas das movimentações DO PERÍODO.
   *  - Positivo: NF foi criada no período e ainda não foi totalmente recebida.
   *  - Zero: NF foi criada e totalmente recebida no período.
   *  - Negativo: recebemos pagamento(s) de NF criada em período anterior.
   *
   * Importante: NFs criadas em períodos anteriores e ainda abertas em 31/X NÃO
   * aparecem aqui (estão embutidas em saldoAnterior).
   */
  saldosPorNF: Map<string, number>;
  /** Saldo final calculado: saldoAnterior + sum(debitos) - sum(creditos). */
  saldoFinalCalculado: number;
  /** Total geral debitado no período. */
  totalDebitoPeriodo: number;
  /** Total geral creditado no período. */
  totalCreditoPeriodo: number;
}

/**
 * Extrai NF + cliente do campo HISTORICO do balancete.
 *
 * Padrões reconhecidos:
 *  - "NF 000032416 - KOCH DO BRASIL"        → CRIACAO_NF, NF=32416, cliente="KOCH DO BRASIL"
 *  - "REC. NF. 000032162 COMPANHIA S"       → RECEBIMENTO, NF=32162, cliente="COMPANHIA S"
 *  - "RECEBIMENT. NF. 000032291 KARI"       → RECEBIMENTO, NF=32291, cliente="KARI"
 *  - "RA 000120326-"                        → RA, NF=null
 *  - "COMP RA .NR.RA 000040326-"            → RA_COMP, NF=null
 *  - qualquer outro                         → OUTRO, NF=null
 */
export function parseHistorico(historico: string | null | undefined): {
  numeroNF: string | null;
  cliente: string | null;
  tipo: TipoLancamento;
} {
  if (!historico) return { numeroNF: null, cliente: null, tipo: "OUTRO" };

  const s = historico.trim();

  // RECEBIMENTO (várias formas: REC., RECEB., RECEBIMENT., RECEBIMENTO)
  const recMatch = /^RECEB(?:IMENT(?:O|\.)?|\.)?\s+(?:DA\s+)?NF\.?\s+0*(\d+)(?:\s+-?\s*(.*))?$/i.exec(s);
  if (recMatch) {
    return {
      numeroNF: recMatch[1] || null,
      cliente: recMatch[2]?.trim() || null,
      tipo: "RECEBIMENTO",
    };
  }
  // Forma mais comum "REC. NF. ..." (REC sozinho)
  const recCurto = /^REC\.?\s+NF\.?\s+0*(\d+)(?:\s+-?\s*(.*))?$/i.exec(s);
  if (recCurto) {
    return { numeroNF: recCurto[1] || null, cliente: recCurto[2]?.trim() || null, tipo: "RECEBIMENTO" };
  }

  // CRIAÇÃO DE NF
  const nfMatch = /^NF\s+0*(\d+)\s*-?\s*(.*)$/i.exec(s);
  if (nfMatch) {
    return {
      numeroNF: nfMatch[1] || null,
      cliente: nfMatch[2]?.trim() || null,
      tipo: "CRIACAO_NF",
    };
  }

  // RA compensação
  if (/^COMP\s+RA/i.test(s)) {
    return { numeroNF: null, cliente: null, tipo: "RA_COMP" };
  }

  // RA simples
  if (/^RA\s+/i.test(s)) {
    return { numeroNF: null, cliente: null, tipo: "RA" };
  }

  return { numeroNF: null, cliente: null, tipo: "OUTRO" };
}

function pickLancamentosSheet(sheets: { name: string; rows: unknown[][] }[]): { name: string; rows: unknown[][] } | null {
  // Procura "Lançamentos Contábeis" (com ou sem acento, com ou sem prefixo numérico)
  return (
    sheets.find((s) => normalizeHeader(s.name).includes("lancamento")) ??
    sheets.find((s) => normalizeHeader(s.name).includes("contabe")) ??
    null
  );
}

function pickContaSheet(sheets: { name: string; rows: unknown[][] }[]): { name: string; rows: unknown[][] } | null {
  return (
    sheets.find((s) => {
      const n = normalizeHeader(s.name);
      return n === "conta" || n.endsWith("conta") || n.startsWith("conta");
    }) ?? null
  );
}

function pickTotalizadoresSheet(sheets: { name: string; rows: unknown[][] }[]): { name: string; rows: unknown[][] } | null {
  return (
    sheets.find((s) => normalizeHeader(s.name).includes("totalizadoresdaconta")) ??
    sheets.find((s) => normalizeHeader(s.name).includes("totalizador")) ??
    null
  );
}

function pickParametrosSheet(sheets: { name: string; rows: unknown[][] }[]): { name: string; rows: unknown[][] } | null {
  return sheets.find((s) => normalizeHeader(s.name).includes("parametro")) ?? null;
}

function extractDataRange(parametrosRows: unknown[][]): { inicio: Date | null; fim: Date | null } {
  let inicio: Date | null = null;
  let fim: Date | null = null;
  for (const row of parametrosRows) {
    const label = (toCleanString(row?.[0]) ?? "").toLowerCase();
    if (label.includes("da data")) inicio = toDate(row?.[1]) ?? inicio;
    if (label.includes("ate a data") || label.includes("até a data")) fim = toDate(row?.[1]) ?? fim;
  }
  return { inicio, fim };
}

function extractConta(contaRows: unknown[][]): { conta: string | null; descricao: string | null } {
  // Procura header "CONTA | DESCRICAO" e pega a linha seguinte
  for (let i = 0; i < contaRows.length; i++) {
    const row = contaRows[i];
    if (!row) continue;
    const a = normalizeHeader(toCleanString(row[0]));
    const b = normalizeHeader(toCleanString(row[1]));
    if (a === "conta" && (b === "descricao" || b === "descrição")) {
      const next = contaRows[i + 1];
      if (next) {
        const conta = toCleanString(next[0]);
        const descricao = toCleanString(next[1])?.replace(/^-\s*/, "")?.trim() ?? null;
        return { conta, descricao };
      }
    }
  }
  // Fallback: primeira linha não-header com 2 colunas
  return { conta: null, descricao: null };
}

function extractSaldoAnterior(totalRows: unknown[][]): number {
  // Linha tem padrão "CONTA - X - Desc | SALDO ANTERIOR: 5.685.580,40"
  for (const row of totalRows) {
    for (const cell of row ?? []) {
      const s = toCleanString(cell);
      if (s && /saldo\s+anterior/i.test(s)) {
        // Extrai o valor depois de ':'
        const m = /([\d.,]+)\s*[DC]?\s*$/.exec(s);
        if (m) {
          const v = toDecimalStr(m[1]);
          if (v != null) return Number(v);
        }
      }
    }
  }
  return 0;
}

function toNumber(v: unknown): number {
  const s = toDecimalStr(v);
  if (s == null) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Saldo da coluna "SALDO ATUAL" pode vir como "5.957.840,60 D". Strip D/C. */
function parseSaldoAtual(v: unknown): number {
  const s = toCleanString(v);
  if (s == null) return 0;
  const clean = s.replace(/\s*[DC]\s*$/i, "");
  const num = toDecimalStr(clean);
  return num == null ? 0 : Number(num);
}

/**
 * Parser principal do balancete contábil da conta de Clientes.
 *
 * @param buffer Conteúdo .xlsx
 */
export async function parseBalanceteContabil(buffer: Buffer): Promise<ParseResult<LancamentoContabil> & {
  contaContabil: string | null;
  descricaoConta: string | null;
  saldoAnterior: number;
  dataInicio: Date | null;
  dataFim: Date | null;
  saldosPorNF: Map<string, number>;
  saldoFinalCalculado: number;
  totalDebitoPeriodo: number;
  totalCreditoPeriodo: number;
}> {
  const sheets = await readExcelWorkbook(buffer);
  const warnings: string[] = [];

  if (sheets.length === 0) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["Arquivo Excel vazio."],
      contaContabil: null,
      descricaoConta: null,
      saldoAnterior: 0,
      dataInicio: null,
      dataFim: null,
      saldosPorNF: new Map(),
      saldoFinalCalculado: 0,
      totalDebitoPeriodo: 0,
      totalCreditoPeriodo: 0,
    };
  }

  const parametrosSheet = pickParametrosSheet(sheets);
  const { inicio, fim } = parametrosSheet
    ? extractDataRange(parametrosSheet.rows)
    : { inicio: null, fim: null };

  const contaSheet = pickContaSheet(sheets);
  const { conta, descricao } = contaSheet ? extractConta(contaSheet.rows) : { conta: null, descricao: null };

  const totalSheet = pickTotalizadoresSheet(sheets);
  const saldoAnterior = totalSheet ? extractSaldoAnterior(totalSheet.rows) : 0;

  const lancSheet = pickLancamentosSheet(sheets);
  if (!lancSheet) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["Aba 'Lançamentos Contábeis' não encontrada."],
      contaContabil: conta,
      descricaoConta: descricao,
      saldoAnterior,
      dataInicio: inicio,
      dataFim: fim,
      saldosPorNF: new Map(),
      saldoFinalCalculado: saldoAnterior,
      totalDebitoPeriodo: 0,
      totalCreditoPeriodo: 0,
    };
  }

  const headerRow = lancSheet.rows[0];
  if (!headerRow) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["Header de lançamentos não encontrado."],
      contaContabil: conta,
      descricaoConta: descricao,
      saldoAnterior,
      dataInicio: inicio,
      dataFim: fim,
      saldosPorNF: new Map(),
      saldoFinalCalculado: saldoAnterior,
      totalDebitoPeriodo: 0,
      totalCreditoPeriodo: 0,
    };
  }

  const idx = buildHeaderIndex(headerRow);
  const cData = findCol(idx, "DATA");
  const cHistorico = findCol(idx, "HISTORICO", "Histórico");
  const cDebito = findCol(idx, "DEBITO", "Débito");
  const cCredito = findCol(idx, "CREDITO", "Crédito");
  const cSaldoAtual = findCol(idx, "SALDO ATUAL", "Saldo Atual");

  if (cHistorico === null || cDebito === null || cCredito === null) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["Colunas obrigatórias (HISTORICO, DEBITO, CREDITO) não encontradas no balancete."],
      contaContabil: conta,
      descricaoConta: descricao,
      saldoAnterior,
      dataInicio: inicio,
      dataFim: fim,
      saldosPorNF: new Map(),
      saldoFinalCalculado: saldoAnterior,
      totalDebitoPeriodo: 0,
      totalCreditoPeriodo: 0,
    };
  }

  const lancamentos: LancamentoContabil[] = [];
  const saldosPorNF = new Map<string, number>();
  let totalDebito = 0;
  let totalCredito = 0;
  let skipped = 0;

  for (let r = 1; r < lancSheet.rows.length; r++) {
    const row = lancSheet.rows[r];
    if (!row || row.every((c) => c == null || c === "")) continue;

    const historico = toCleanString(row[cHistorico]);
    if (!historico) {
      skipped++;
      continue;
    }

    const debito = toNumber(row[cDebito]);
    const credito = toNumber(row[cCredito]);
    if (debito === 0 && credito === 0) {
      skipped++;
      continue;
    }

    const { numeroNF, cliente, tipo } = parseHistorico(historico);

    lancamentos.push({
      data: cData !== null ? toDate(row[cData]) : null,
      historico,
      numeroNF,
      cliente,
      debito,
      credito,
      saldoAtual: cSaldoAtual !== null ? parseSaldoAtual(row[cSaldoAtual]) : 0,
      tipoLancamento: tipo,
    });

    totalDebito += debito;
    totalCredito += credito;

    if (numeroNF) {
      const cur = saldosPorNF.get(numeroNF) ?? 0;
      saldosPorNF.set(numeroNF, cur + debito - credito);
    }
  }

  return {
    rows: lancamentos,
    skipped,
    warnings,
    contaContabil: conta,
    descricaoConta: descricao,
    saldoAnterior,
    dataInicio: inicio,
    dataFim: fim,
    saldosPorNF,
    saldoFinalCalculado: saldoAnterior + totalDebito - totalCredito,
    totalDebitoPeriodo: totalDebito,
    totalCreditoPeriodo: totalCredito,
  };
}
