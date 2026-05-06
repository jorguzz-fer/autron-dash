import { readExcelRows } from "./excel";
import {
  ParseResult,
  buildHeaderIndex,
  findCol,
  toCleanString,
  toDate,
  toDecimalStr,
  toIdString,
  toInt,
} from "./types";

export interface PedidoRow {
  numPedido: string;
  item: number;
  produto: string;
  descricaoProduto: string | null;
  quantidade: number;
  vlrTotal: string | null;
  margemPct: string | null;
  dtEmissao: Date | null;
  dtOfertada: Date | null;
  dtFatCli: Date | null;
  notaFiscal: number | null;
  numeroSC: string | null;
  itemSC: number | null;
  numeroOP: string | null;
  itemOP: number | null;
  pedCliente: string | null;
  nomeVendedor: string | null;
  unidadeNegocio: string | null;
}

const HEADER_ROW_INDEX = 1; // linha 2 no Excel (0-based)

export async function parsePedido(buffer: Buffer): Promise<ParseResult<PedidoRow>> {
  const allRows = await readExcelRows(buffer);
  const warnings: string[] = [];
  if (allRows.length <= HEADER_ROW_INDEX) {
    return { rows: [], skipped: 0, warnings: ["arquivo vazio ou sem header"] };
  }

  const idx = buildHeaderIndex(allRows[HEADER_ROW_INDEX]);

  const cNumPedido = findCol(idx, "Num. Pedido", "Numero Pedido", "Num Pedido");
  const cItem = findCol(idx, "Item");
  const cProduto = findCol(idx, "Produto");
  const cDescricao = findCol(idx, "Descricao do Produto", "Descrição do Produto", "Descricao Produto");
  const cQuantidade = findCol(idx, "Quantidade", "Qtd");
  const cVlrTotal = findCol(idx, "Vlr.Total", "Valor Total", "Vlr Total");
  const cMargem = findCol(idx, "Margem");
  const cDtEmissao = findCol(idx, "DT Emissao", "Dt Emissao", "Emissao");
  const cDtOfertada = findCol(idx, "DT. Ofertada", "Dt Ofertada");
  const cDtFatCli = findCol(idx, "DT. Fat. Cli", "Dt Fat Cli");
  const cNF = findCol(idx, "Nota Fiscal", "NF");
  const cNumSC = findCol(idx, "Numero SC", "No SC");
  const cItemSC = findCol(idx, "Item SC");
  const cNumOP = findCol(idx, "Numero OP", "No OP");
  const cItemOP = findCol(idx, "Item OP");
  const cPedCliente = findCol(idx, "Ped Cliente", "Pedido Cliente");
  const cVendedor = findCol(idx, "Nome do Vendedor", "Vendedor");
  const cUN = findCol(idx, "Unidade Negocio", "Unidade de Negocio");

  if (cNumPedido === null || cItem === null || cProduto === null || cQuantidade === null) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["colunas obrigatórias ausentes: Num. Pedido, Item, Produto e/ou Quantidade"],
    };
  }

  const rows: PedidoRow[] = [];
  let skipped = 0;

  for (let r = HEADER_ROW_INDEX + 1; r < allRows.length; r++) {
    const row = allRows[r];
    const numPedido = toIdString(row[cNumPedido]);
    const item = toInt(row[cItem]);
    const produto = toCleanString(row[cProduto]);
    const quantidade = toInt(row[cQuantidade]);

    if (!numPedido || item === null || !produto || quantidade === null) {
      skipped++;
      continue;
    }

    // Regra de negócio: PVs iniciados com 'I' ou 'B' são excluídos
    if (/^[IB]/i.test(numPedido)) {
      skipped++;
      continue;
    }

    rows.push({
      numPedido,
      item,
      produto,
      descricaoProduto: cDescricao !== null ? toCleanString(row[cDescricao]) : null,
      quantidade,
      vlrTotal: cVlrTotal !== null ? toDecimalStr(row[cVlrTotal]) : null,
      margemPct: cMargem !== null ? toDecimalStr(row[cMargem]) : null,
      dtEmissao: cDtEmissao !== null ? toDate(row[cDtEmissao]) : null,
      dtOfertada: cDtOfertada !== null ? toDate(row[cDtOfertada]) : null,
      dtFatCli: cDtFatCli !== null ? toDate(row[cDtFatCli]) : null,
      notaFiscal: cNF !== null ? toInt(row[cNF]) : null,
      numeroSC: cNumSC !== null ? toIdString(row[cNumSC]) : null,
      itemSC: cItemSC !== null ? toInt(row[cItemSC]) : null,
      numeroOP: cNumOP !== null ? toIdString(row[cNumOP]) : null,
      itemOP: cItemOP !== null ? toInt(row[cItemOP]) : null,
      pedCliente: cPedCliente !== null ? toIdString(row[cPedCliente]) : null,
      nomeVendedor: cVendedor !== null ? toCleanString(row[cVendedor]) : null,
      unidadeNegocio: cUN !== null ? toCleanString(row[cUN]) : null,
    });
  }

  // Deduplicação dentro do mesmo arquivo (último ganha) — protege @@unique
  const seen = new Map<string, number>();
  const deduped: PedidoRow[] = [];
  rows.forEach((row) => {
    const key = `${row.numPedido}|${row.item}`;
    const existing = seen.get(key);
    if (existing !== undefined) {
      deduped[existing] = row;
    } else {
      seen.set(key, deduped.length);
      deduped.push(row);
    }
  });
  if (deduped.length !== rows.length) {
    warnings.push(`${rows.length - deduped.length} linha(s) duplicada(s) consolidada(s) (chave: numPedido+item)`);
  }

  return { rows: deduped, skipped, warnings };
}
