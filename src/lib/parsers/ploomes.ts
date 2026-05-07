import * as XLSX from "xlsx";
import {
  ParseResult,
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

/**
 * Parser do export do CRM Ploomes (Ganhas.xlsx).
 *
 * Usa SheetJS (xlsx) em vez de exceljs porque o arquivo de export do Ploomes
 * tem um formato XLSX que o exceljs falha em parsear (`Cannot read properties
 * of undefined (reading 'sheets')`). SheetJS lida com mais variantes de XLSX.
 *
 * Versão do tarball oficial: https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz
 * (sem as CVEs do pacote npm public).
 */
export async function parsePloomes(buffer: Buffer): Promise<ParseResult<PloomesRow>> {
  const warnings: string[] = [];
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch (err) {
    return {
      rows: [],
      skipped: 0,
      warnings: [
        "Falha ao abrir o XLSX: " +
          (err instanceof Error ? err.message : String(err)),
      ],
    };
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    return { rows: [], skipped: 0, warnings: ["arquivo sem abas"] };
  }

  const sheetName =
    workbook.SheetNames.find((n) => /ploomes|ganhas/i.test(n)) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return { rows: [], skipped: 0, warnings: ["aba selecionada vazia"] };
  }

  type RawRow = Record<string, unknown>;
  const records = XLSX.utils.sheet_to_json<RawRow>(sheet, {
    raw: true,
    defval: null,
  });

  if (records.length === 0) {
    return { rows: [], skipped: 0, warnings: ["aba sem registros"] };
  }

  const sample = records[0];
  const headerKeys = Object.keys(sample);

  function findColumn(...candidates: string[]): string | null {
    for (const cand of candidates) {
      const candNorm = normalize(cand);
      const match = headerKeys.find((k) => normalize(k) === candNorm);
      if (match) return match;
    }
    return null;
  }

  const cTitulo = findColumn("Título", "Titulo", "Title");
  const cId = findColumn("Id", "ID");
  const cCodigoCliente = findColumn("Código ID do Cliente", "Codigo ID do Cliente", "Codigo Cliente");
  const cCliente = findColumn("Cliente");
  const cResponsavel = findColumn("Responsável", "Responsavel");
  const cValor = findColumn("Valor");
  const cTermino = findColumn("Término", "Termino", "Data de Término", "Fechamento");
  const cCriacao = findColumn("Data de criação", "Data de criacao", "Criação");
  const cMarcadores = findColumn("Marcadores");
  const cCidade = findColumn("Cidade do Cliente", "Cidade");
  const cUF = findColumn("Estado do Cliente", "Estado", "UF");
  const cEmail = findColumn(
    "E-mail da pessoa que irá receber a Pesquisa",
    "Email",
    "E-mail",
  );
  const cPedidoCompra = findColumn(
    "Número do Pedido de Compra do cliente",
    "Numero do Pedido de Compra do cliente",
    "Pedido de Compra do cliente",
    "Pedido Compra Cliente",
  );

  if (!cTitulo || !cId) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["colunas obrigatórias ausentes: Título e/ou Id"],
    };
  }

  const rows: PloomesRow[] = [];
  let skipped = 0;
  for (const rec of records) {
    const ploomesIdRaw = rec[cId];
    const titulo = toCleanString(rec[cTitulo]);
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
      codigoCliente: cCodigoCliente ? toCleanString(rec[cCodigoCliente]) : null,
      cliente: cCliente ? toCleanString(rec[cCliente]) : null,
      responsavel: cResponsavel ? toCleanString(rec[cResponsavel]) : null,
      valor: cValor ? toDecimalStr(rec[cValor]) : null,
      termino: cTermino ? toDate(rec[cTermino]) : null,
      criacao: cCriacao ? toDate(rec[cCriacao]) : null,
      marcadores: cMarcadores ? toCleanString(rec[cMarcadores]) : null,
      cidadeCliente: cCidade ? toCleanString(rec[cCidade]) : null,
      ufCliente: cUF ? toCleanString(rec[cUF]) : null,
      emailContato: cEmail ? toCleanString(rec[cEmail]) : null,
      pedidoCompraCliente: cPedidoCompra ? toCleanString(rec[cPedidoCompra]) : null,
    });
  }

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
  warnings.push(`Aba selecionada: "${sheetName}" (${records.length} registros)`);

  return { rows: deduped, skipped, warnings };
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
