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

// Colunas que IDENTIFICAM uma aba como "Notas Fiscais de Venda" (não devoluções).
// Devoluções (que devem ser ignoradas) usam "DT Digitacao"/"Documento", não "Emissao"/"Num. Docto.".
const SHEET_REQUIRED_HEADERS = ["Emissao", "Num. Docto."];
const HEADER_ROW_CANDIDATES = [1, 0, 2, 3];

function pickFaturamentoSheet(sheets: SheetData[]): {
  sheet: SheetData;
  headerIndex: number;
} | null {
  for (const sheet of sheets) {
    for (const hr of HEADER_ROW_CANDIDATES) {
      if (sheet.rows.length <= hr) continue;
      const idx = buildHeaderIndex(sheet.rows[hr]);
      const allFound = SHEET_REQUIRED_HEADERS.every((h) => idx.has(normalizeHeader(h)));
      if (allFound) return { sheet, headerIndex: hr };
    }
  }
  return null;
}

export async function parseFaturamento(buffer: Buffer): Promise<ParseResult<FaturamentoRow>> {
  const sheets = await readExcelWorkbook(buffer);
  const warnings: string[] = [];
  if (sheets.length === 0) {
    return { rows: [], skipped: 0, warnings: ["arquivo sem abas"] };
  }

  const picked = pickFaturamentoSheet(sheets);
  if (!picked) {
    return {
      rows: [],
      skipped: 0,
      warnings: [
        `nenhuma aba contém os headers de venda esperados (Emissao + Num. Docto.). Abas encontradas: ${sheets
          .map((s) => `"${s.name}"`)
          .join(", ")}`,
      ],
    };
  }
  const { sheet, headerIndex: HEADER_ROW_INDEX } = picked;
  const allRows = sheet.rows;

  if (sheet.name) {
    warnings.push(`aba selecionada: "${sheet.name}" (header na linha ${HEADER_ROW_INDEX + 1})`);
  }

  const idx = buildHeaderIndex(allRows[HEADER_ROW_INDEX]);

  const cEmissao = findCol(idx, "Emissao", "Emissão");
  const cNumDocto = findCol(idx, "Num. Docto.", "Num Docto", "Numero NF", "NF");
  const cProduto = findCol(idx, "Produto");
  const cDescricao = findCol(idx, "Descricao Produto", "Descrição Produto", "Descricao do Produto");
  const cQtd = findCol(idx, "Quantidade", "Qtd");
  const cVlrUnit = findCol(idx, "Vlr.Unitario", "Vlr Unitario", "Preço Unitário");
  const cVlrBruto = findCol(idx, "Vlr.Bruto", "Vlr Bruto");
  const cVlrIcms = findCol(idx, "Vlr.ICMS", "Vlr ICMS");
  const cVlrIpi = findCol(idx, "Vlr.IPI", "Vlr IPI");
  const cNoPed = findCol(idx, "No do Pedido", "Numero Pedido", "Num Pedido");
  const cItemPv = findCol(idx, "Item Pv", "Item PV");
  const cFatBruto = findCol(idx, "Faturamento Bruto", "Fat. Bruto");
  const cFatLiq = findCol(idx, "Faturamento Liquido", "Fat. Liquido");
  const cMargemR = findCol(idx, "Margem Liquida (R$)", "Margem Liquida R$", "Margem R$");
  const cMargemPct = findCol(idx, "Margem Liquida (%) por NF Faturada", "Margem Liquida %", "Margem %");
  const cVendedor = findCol(idx, "Nome do Vendedor", "Vendedor");
  const cRazao = findCol(idx, "Razao Social", "Razão Social");
  const cFantasia = findCol(idx, "Nome Fantasia");
  const cUF = findCol(idx, "UF", "Estado");
  const cTipoNeg = findCol(idx, "Tipo de Negocio", "Tipo de Negócio", "Tipo Negocio");

  if (cNumDocto === null || cProduto === null || cQtd === null) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["colunas obrigatórias ausentes: Num. Docto., Produto e/ou Quantidade"],
    };
  }

  const rows: FaturamentoRow[] = [];
  let skipped = 0;

  for (let r = HEADER_ROW_INDEX + 1; r < allRows.length; r++) {
    const row = allRows[r];
    const numDocto = toIdString(row[cNumDocto]);
    const produto = toCleanString(row[cProduto]);
    const quantidade = toInt(row[cQtd]);

    if (!numDocto || !produto || quantidade === null) {
      skipped++;
      continue;
    }

    rows.push({
      emissao: cEmissao !== null ? toDate(row[cEmissao]) : null,
      numDocto,
      produto,
      descricaoProduto: cDescricao !== null ? toCleanString(row[cDescricao]) : null,
      quantidade,
      vlrUnitario: cVlrUnit !== null ? toDecimalStr(row[cVlrUnit]) : null,
      vlrBruto: cVlrBruto !== null ? toDecimalStr(row[cVlrBruto]) : null,
      vlrIcms: cVlrIcms !== null ? toDecimalStr(row[cVlrIcms]) : null,
      vlrIpi: cVlrIpi !== null ? toDecimalStr(row[cVlrIpi]) : null,
      noPedido: cNoPed !== null ? toIdString(row[cNoPed]) : null,
      itemPv: cItemPv !== null ? toInt(row[cItemPv]) : null,
      faturamentoBruto: cFatBruto !== null ? toDecimalStr(row[cFatBruto]) : null,
      faturamentoLiquido: cFatLiq !== null ? toDecimalStr(row[cFatLiq]) : null,
      margemLiquidaR: cMargemR !== null ? toDecimalStr(row[cMargemR]) : null,
      margemLiquidaPct: cMargemPct !== null ? toDecimalStr(row[cMargemPct]) : null,
      nomeVendedor: cVendedor !== null ? toCleanString(row[cVendedor]) : null,
      razaoSocial: cRazao !== null ? toCleanString(row[cRazao]) : null,
      nomeFantasia: cFantasia !== null ? toCleanString(row[cFantasia]) : null,
      uf: cUF !== null ? toCleanString(row[cUF]) : null,
      tipoNegocio: cTipoNeg !== null ? toCleanString(row[cTipoNeg]) : null,
    });
  }

  // Dedup pela chave única (tenant + numDocto + produto + itemPv)
  const seen = new Map<string, number>();
  const deduped: FaturamentoRow[] = [];
  rows.forEach((row) => {
    const key = `${row.numDocto}|${row.produto}|${row.itemPv ?? "_"}`;
    const existing = seen.get(key);
    if (existing !== undefined) {
      deduped[existing] = row;
    } else {
      seen.set(key, deduped.length);
      deduped.push(row);
    }
  });
  if (deduped.length !== rows.length) {
    warnings.push(`${rows.length - deduped.length} linha(s) duplicada(s) consolidada(s)`);
  }

  return { rows: deduped, skipped, warnings };
}
