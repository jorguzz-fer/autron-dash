import { readExcelWorkbook, SheetData } from "./excel";
import {
  ParseResult,
  buildHeaderIndex,
  findCol,
  normalizeHeader,
  toCleanString,
  toDate,
  toDecimalStr,
  toIdString,
  toInt,
} from "./types";

export interface FaturamentoRow {
  emissao: Date | null;
  numDocto: string;
  produto: string;
  descricaoProduto: string | null;
  quantidade: number;
  vlrUnitario: string | null;
  vlrBruto: string | null;
  vlrIcms: string | null;
  vlrIpi: string | null;
  noPedido: string | null;
  itemPv: number | null;
  faturamentoBruto: string | null;
  faturamentoLiquido: string | null;
  margemLiquidaR: string | null;
  margemLiquidaPct: string | null;
  nomeVendedor: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  uf: string | null;
  tipoNegocio: string | null;
}

// Vendas usam "Emissao" + "Num. Docto." nos headers.
// Devoluções usam "DT Digitacao" / "Documento" + colunas "Devolucao Bruta/Liquida".
// Paridade Streamlit app.py:374-438: o app lê AS DUAS abas, normaliza colunas
// da devolução (DT Digitacao → Emissao, Documento → Num. Docto., Pedido de Venda
// → No do Pedido) e soma com valores NEGATIVOS, deduplicando por Num. Docto.
const VENDAS_HEADERS = ["Emissao", "Num. Docto."];
const DEVOL_HEADER_CANDIDATES = [
  ["DT Digitacao", "Documento"],
  ["Dt Digitacao", "Documento"],
  ["DT Digitação", "Documento"],
  ["Emissao", "Documento"],
];
const HEADER_ROW_CANDIDATES = [1, 0, 2, 3];

function tryHeaders(sheet: SheetData, required: string[]): number | null {
  for (const hr of HEADER_ROW_CANDIDATES) {
    if (sheet.rows.length <= hr) continue;
    const idx = buildHeaderIndex(sheet.rows[hr]);
    if (required.every((h) => idx.has(normalizeHeader(h)))) return hr;
  }
  return null;
}

function pickVendasSheet(sheets: SheetData[]): { sheet: SheetData; headerIndex: number } | null {
  // Prioriza aba com "venda" no nome; se não achar, qualquer aba com VENDAS_HEADERS.
  const ordered = [...sheets].sort((a, b) => {
    const an = (a.name ?? "").toLowerCase();
    const bn = (b.name ?? "").toLowerCase();
    const aIsVenda = an.includes("venda") && !an.includes("dev") ? 1 : 0;
    const bIsVenda = bn.includes("venda") && !bn.includes("dev") ? 1 : 0;
    return bIsVenda - aIsVenda;
  });
  for (const sheet of ordered) {
    const hi = tryHeaders(sheet, VENDAS_HEADERS);
    if (hi !== null) return { sheet, headerIndex: hi };
  }
  return null;
}

function pickDevolSheet(
  sheets: SheetData[],
  vendasSheet: SheetData | null,
): { sheet: SheetData; headerIndex: number; isDevolColumns: boolean } | null {
  // Procura aba cujo nome inclua "dev" (e que NÃO seja a aba de vendas).
  for (const sheet of sheets) {
    if (sheet === vendasSheet) continue;
    const name = (sheet.name ?? "").toLowerCase();
    if (!name.includes("dev")) continue;
    for (const combo of DEVOL_HEADER_CANDIDATES) {
      const hi = tryHeaders(sheet, combo);
      if (hi !== null) {
        // Confirmar que tem coluna de valor de devolução
        const idx = buildHeaderIndex(sheet.rows[hi]);
        const hasDevolValor =
          idx.has(normalizeHeader("Devolucao Bruta")) ||
          idx.has(normalizeHeader("Devolução Bruta")) ||
          idx.has(normalizeHeader("Devolucao Liquida")) ||
          idx.has(normalizeHeader("Devolução Líquida"));
        return { sheet, headerIndex: hi, isDevolColumns: hasDevolValor };
      }
    }
  }
  return null;
}

/**
 * Lê linhas de uma aba (Vendas ou Devoluções).
 * Para a aba de Devoluções (isDevol=true), faz o mapeamento de colunas:
 *   DT Digitacao → emissao, Documento → numDocto, Pedido de Venda → noPedido,
 *   Devolucao Bruta/Liquida → faturamentoBruto/Liquido (NEGATIVOS).
 */
function readSheetRows(
  sheet: SheetData,
  headerIndex: number,
  isDevol: boolean,
): { rows: FaturamentoRow[]; skipped: number } {
  const allRows = sheet.rows;
  const idx = buildHeaderIndex(allRows[headerIndex]);

  const cEmissao = isDevol
    ? findCol(idx, "DT Digitacao", "Dt Digitacao", "DT Digitação", "Emissao", "Emissão")
    : findCol(idx, "Emissao", "Emissão");
  const cNumDocto = isDevol
    ? findCol(idx, "Documento", "Num. Docto.", "Num Docto")
    : findCol(idx, "Num. Docto.", "Num Docto", "Numero NF", "NF");
  const cProduto = findCol(idx, "Produto");
  const cDescricao = findCol(idx, "Descricao Produto", "Descrição Produto", "Descricao do Produto");
  const cQtd = findCol(idx, "Quantidade", "Qtd");
  const cVlrUnit = findCol(idx, "Vlr.Unitario", "Vlr Unitario", "Preço Unitário");
  const cVlrBruto = findCol(idx, "Vlr.Bruto", "Vlr Bruto");
  const cVlrIcms = findCol(idx, "Vlr.ICMS", "Vlr ICMS");
  const cVlrIpi = findCol(idx, "Vlr.IPI", "Vlr IPI");
  const cNoPed = isDevol
    ? findCol(idx, "Pedido de Venda", "No do Pedido", "Numero Pedido")
    : findCol(idx, "No do Pedido", "Numero Pedido", "Num Pedido");
  const cItemPv = findCol(idx, "Item Pv", "Item PV");
  const cFatBruto = isDevol
    ? findCol(idx, "Devolucao Bruta", "Devolução Bruta")
    : findCol(idx, "Faturamento Bruto", "Fat. Bruto");
  const cFatLiq = isDevol
    ? findCol(idx, "Devolucao Liquida", "Devolução Líquida", "Devolucao Líquida")
    : findCol(idx, "Faturamento Liquido", "Fat. Liquido");
  const cMargemR = findCol(idx, "Margem Liquida (R$)", "Margem Liquida R$", "Margem R$");
  const cMargemPct = findCol(idx, "Margem Liquida (%) por NF Faturada", "Margem Liquida %", "Margem %");
  const cVendedor = findCol(idx, "Nome do Vendedor", "Vendedor");
  const cRazao = findCol(idx, "Razao Social", "Razão Social");
  const cFantasia = findCol(idx, "Nome Fantasia");
  const cUF = findCol(idx, "UF", "Estado");
  const cTipoNeg = findCol(idx, "Tipo de Negocio", "Tipo de Negócio", "Tipo Negocio");

  const rows: FaturamentoRow[] = [];
  let skipped = 0;

  if (cNumDocto === null || cProduto === null || cQtd === null) {
    return { rows, skipped };
  }

  // Para devoluções: força valores negativos. Streamlit: -abs(Devolucao Bruta/Liquida).
  const signFlip = (s: string | null): string | null => {
    if (s == null) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return s;
    return String(-Math.abs(n));
  };

  for (let r = headerIndex + 1; r < allRows.length; r++) {
    const row = allRows[r];
    const numDocto = toIdString(row[cNumDocto]);
    const produto = toCleanString(row[cProduto]);
    const quantidade = toInt(row[cQtd]);

    if (!numDocto || !produto || quantidade === null) {
      skipped++;
      continue;
    }

    const fatBrutoRaw = cFatBruto !== null ? toDecimalStr(row[cFatBruto]) : null;
    const fatLiqRaw = cFatLiq !== null ? toDecimalStr(row[cFatLiq]) : null;

    rows.push({
      emissao: cEmissao !== null ? toDate(row[cEmissao]) : null,
      numDocto,
      produto,
      descricaoProduto: cDescricao !== null ? toCleanString(row[cDescricao]) : null,
      quantidade: isDevol ? -Math.abs(quantidade) : quantidade,
      vlrUnitario: cVlrUnit !== null ? toDecimalStr(row[cVlrUnit]) : null,
      vlrBruto: cVlrBruto !== null ? toDecimalStr(row[cVlrBruto]) : null,
      vlrIcms: cVlrIcms !== null ? toDecimalStr(row[cVlrIcms]) : null,
      vlrIpi: cVlrIpi !== null ? toDecimalStr(row[cVlrIpi]) : null,
      noPedido: cNoPed !== null ? toIdString(row[cNoPed]) : null,
      itemPv: cItemPv !== null ? toInt(row[cItemPv]) : null,
      faturamentoBruto: isDevol ? signFlip(fatBrutoRaw) : fatBrutoRaw,
      faturamentoLiquido: isDevol ? signFlip(fatLiqRaw) : fatLiqRaw,
      margemLiquidaR: cMargemR !== null ? toDecimalStr(row[cMargemR]) : null,
      margemLiquidaPct: cMargemPct !== null ? toDecimalStr(row[cMargemPct]) : null,
      nomeVendedor: cVendedor !== null ? toCleanString(row[cVendedor]) : null,
      razaoSocial: cRazao !== null ? toCleanString(row[cRazao]) : null,
      nomeFantasia: cFantasia !== null ? toCleanString(row[cFantasia]) : null,
      uf: cUF !== null ? toCleanString(row[cUF]) : null,
      tipoNegocio: cTipoNeg !== null ? toCleanString(row[cTipoNeg]) : null,
    });
  }

  return { rows, skipped };
}

export async function parseFaturamento(buffer: Buffer): Promise<ParseResult<FaturamentoRow>> {
  const sheets = await readExcelWorkbook(buffer);
  const warnings: string[] = [];
  if (sheets.length === 0) {
    return { rows: [], skipped: 0, warnings: ["arquivo sem abas"] };
  }

  // 1) Aba de Vendas (obrigatória)
  const vendas = pickVendasSheet(sheets);
  if (!vendas) {
    return {
      rows: [],
      skipped: 0,
      warnings: [
        `nenhuma aba de Vendas (Emissao + Num. Docto.) encontrada. Abas: ${sheets
          .map((s) => `"${s.name}"`)
          .join(", ")}`,
      ],
    };
  }
  if (vendas.sheet.name) {
    warnings.push(`Vendas: aba "${vendas.sheet.name}" (header linha ${vendas.headerIndex + 1})`);
  }

  const vendasRead = readSheetRows(vendas.sheet, vendas.headerIndex, false);
  if (vendasRead.rows.length === 0) {
    return {
      rows: [],
      skipped: vendasRead.skipped,
      warnings: [...warnings, "aba Vendas sem linhas válidas — verifique colunas obrigatórias"],
    };
  }

  // 2) Aba de Devoluções (opcional) — paridade Streamlit app.py:387-438
  const devol = pickDevolSheet(sheets, vendas.sheet);
  let devolRead: { rows: FaturamentoRow[]; skipped: number } = { rows: [], skipped: 0 };
  if (devol && devol.isDevolColumns) {
    warnings.push(`Devoluções: aba "${devol.sheet.name}" (header linha ${devol.headerIndex + 1})`);
    devolRead = readSheetRows(devol.sheet, devol.headerIndex, true);
  }

  // 3) Concat vendas + devoluções, deduplicando por Num. Docto.
  //    (Streamlit: se documento já existe em Vendas, ignora da Devoluções)
  const docsVendas = new Set(vendasRead.rows.map((r) => r.numDocto.trim()));
  const devolNovas = devolRead.rows.filter((r) => !docsVendas.has(r.numDocto.trim()));
  if (devolRead.rows.length > 0) {
    warnings.push(
      `Devoluções: ${devolRead.rows.length} linhas (${devolRead.rows.length - devolNovas.length} já existiam em Vendas, ${devolNovas.length} adicionadas como NEGATIVAS)`,
    );
  }
  // NÃO deduplicar Vendas — paridade Streamlit (app.py:2089).
  // O Streamlit faz df_fat.groupby('Mes').agg(sum) — SOMA todas as linhas,
  // nunca colapsa por (numDocto, produto, itemPv). A NF legitimamente tem
  // múltiplas linhas do mesmo produto (lotes, desdobramentos). O dedup
  // antigo sobrescrevia (mantinha só a última) e perdia receita — causava
  // Fat. Líquido subestimado (~R$ 464k a menos em abr/26 vs Streamlit).
  // A única dedup permitida é Devolução-vs-Venda por Num. Docto. (já feita
  // acima em `devolNovas`), exatamente como o Streamlit (app.py:426-434).
  const allRows = [...vendasRead.rows, ...devolNovas];

  return {
    rows: allRows,
    skipped: vendasRead.skipped + devolRead.skipped,
    warnings,
  };
}
