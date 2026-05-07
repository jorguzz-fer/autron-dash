import { readExcelWorkbook } from "./excel";
import {
  ParseResult,
  buildHeaderIndex,
  findCol,
  toCleanString,
  toDate,
  toDecimalStr,
} from "./types";

export interface PloomesRow {
  ploomesId: string;
  titulo: string;
  codigoCliente: string | null;
  cliente: string | null;
  responsavel: string | null;
  valor: string | null;
  termino: Date | null;
  criacao: Date | null;
  marcadores: string | null;
  cidadeCliente: string | null;
  ufCliente: string | null;
  emailContato: string | null;
  pedidoCompraCliente: string | null;
}

const HEADER_ROW_INDEX = 0; // header na linha 1

/**
 * Parser do export do CRM Ploomes (Ganhas.xlsx).
 * Aba "Ploomes" (com 'o'). Header na linha 1.
 *
 * Colunas esperadas (case/accent-insensitive via findCol):
 *   - Título → titulo (obrigatório)
 *   - Id → ploomesId (obrigatório, chave única)
 *   - Cliente, Código ID do Cliente
 *   - Término (data ganho), Data de criação
 *   - Responsável, Valor
 *   - Cidade do Cliente, Estado do Cliente, Marcadores
 *   - E-mail da pessoa que irá receber a Pesquisa
 *   - Número do Pedido de Compra do cliente (chave de cruzamento)
 */
export async function parsePloomes(buffer: Buffer): Promise<ParseResult<PloomesRow>> {
  const sheets = await readExcelWorkbook(buffer);
  const warnings: string[] = [];
  if (sheets.length === 0) {
    return { rows: [], skipped: 0, warnings: ["arquivo sem abas"] };
  }
  // Aba preferencial: "Ploomes" / "Ploomes Ganhas" / "Ganhas". Cai pra primeira aba.
  const sheet =
    sheets.find((s) => /ploomes|ganhas/i.test(s.name)) ?? sheets[0];
  const allRows = sheet.rows;
  if (allRows.length <= HEADER_ROW_INDEX) {
    return { rows: [], skipped: 0, warnings: ["arquivo vazio ou sem header"] };
  }

  const idx = buildHeaderIndex(allRows[HEADER_ROW_INDEX]);

  const cTitulo = findCol(idx, "Título", "Titulo", "Title");
  const cId = findCol(idx, "Id", "ID");
  const cCodigoCliente = findCol(idx, "Código ID do Cliente", "Codigo ID do Cliente", "Codigo Cliente");
  const cCliente = findCol(idx, "Cliente");
  const cResponsavel = findCol(idx, "Responsável", "Responsavel");
  const cValor = findCol(idx, "Valor");
  const cTermino = findCol(idx, "Término", "Termino", "Data de Término", "Fechamento");
  const cCriacao = findCol(idx, "Data de criação", "Data de criacao", "Criação");
  const cMarcadores = findCol(idx, "Marcadores");
  const cCidade = findCol(idx, "Cidade do Cliente", "Cidade");
  const cUF = findCol(idx, "Estado do Cliente", "Estado", "UF");
  const cEmail = findCol(idx, "E-mail da pessoa que irá receber a Pesquisa", "Email", "E-mail");
  const cPedidoCompra = findCol(
    idx,
    "Número do Pedido de Compra do cliente",
    "Numero do Pedido de Compra do cliente",
    "Pedido de Compra do cliente",
    "Pedido Compra Cliente",
  );

  if (cTitulo === null || cId === null) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["colunas obrigatórias ausentes: Título e/ou Id"],
    };
  }

  const rows: PloomesRow[] = [];
  let skipped = 0;
  for (let r = HEADER_ROW_INDEX + 1; r < allRows.length; r++) {
    const row = allRows[r];
    const ploomesIdRaw = row[cId];
    const titulo = toCleanString(row[cTitulo]);
    if (!titulo || ploomesIdRaw == null) {
      skipped++;
      continue;
    }
    const ploomesId = String(ploomesIdRaw).trim();
    if (!ploomesId) {
      skipped++;
      continue;
    }

    rows.push({
      ploomesId,
      titulo,
      codigoCliente: cCodigoCliente !== null ? toCleanString(row[cCodigoCliente]) : null,
      cliente: cCliente !== null ? toCleanString(row[cCliente]) : null,
      responsavel: cResponsavel !== null ? toCleanString(row[cResponsavel]) : null,
      valor: cValor !== null ? toDecimalStr(row[cValor]) : null,
      termino: cTermino !== null ? toDate(row[cTermino]) : null,
      criacao: cCriacao !== null ? toDate(row[cCriacao]) : null,
      marcadores: cMarcadores !== null ? toCleanString(row[cMarcadores]) : null,
      cidadeCliente: cCidade !== null ? toCleanString(row[cCidade]) : null,
      ufCliente: cUF !== null ? toCleanString(row[cUF]) : null,
      emailContato: cEmail !== null ? toCleanString(row[cEmail]) : null,
      pedidoCompraCliente: cPedidoCompra !== null ? toCleanString(row[cPedidoCompra]) : null,
    });
  }

  // Dedup por ploomesId
  const seen = new Map<string, number>();
  const deduped: PloomesRow[] = [];
  rows.forEach((r) => {
    const ix = seen.get(r.ploomesId);
    if (ix !== undefined) deduped[ix] = r;
    else {
      seen.set(r.ploomesId, deduped.length);
      deduped.push(r);
    }
  });
  if (deduped.length !== rows.length) {
    warnings.push(`${rows.length - deduped.length} duplicatas consolidadas (chave: ploomesId)`);
  }

  warnings.push(`Aba selecionada: "${sheet.name}"`);
  return { rows: deduped, skipped, warnings };
}
