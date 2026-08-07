import { readExcelWorkbook, type SheetData } from "./excel";
import {
  buildHeaderIndex,
  findCol,
  normalizeHeader,
  toCleanString,
  type ParseResult,
} from "./types";
import { normalizeClienteKey } from "@/lib/domain/kpiFinanceiro";

/**
 * Parser do relatório Protheus "clientes com vendedor" (base SA1) —
 * `clientes_com_vendedor.xlsx`.
 *
 * É a foto ATUAL da carteira: o campo **nome vendedor** define quem é HOJE o
 * dono de cada cliente. A Análise de Carteira usa esse mapa para reagrupar o
 * histórico (faturamento e entrada de pedidos) pelo dono atual,
 * independentemente de quem era o vendedor na época da venda.
 *
 * Layout tolerante: o cabeçalho é procurado nas 12 primeiras linhas de cada
 * aba (relatórios Protheus costumam ter título/filtros antes), e cada coluna
 * aceita várias grafias. Só é obrigatória a coluna do NOME do cliente — sem
 * ela não há como cruzar com faturamento/pedidos (que só guardam o nome).
 */
export interface CarteiraClienteRow {
  chaveCadastro: string;
  codigoCliente: string | null;
  loja: string | null;
  cliente: string;
  nomeFantasia: string | null;
  clienteKey: string;
  fantasiaKey: string | null;
  cnpj: string | null;
  municipio: string | null;
  uf: string | null;
  codVendedor: string | null;
  nomeVendedor: string | null;
}

// Ordem importa: a primeira alternativa encontrada vence. Cabeçalhos genéricos
// ("Cliente", "Vendedor") ficam por último porque no Protheus costumam trazer
// o CÓDIGO, não o nome.
const NOME_HEADERS = [
  "Razao Social",
  "Razão Social",
  "Nome Cliente",
  "Nome do Cliente",
  "Nome",
  "A1_NOME",
  "Razao",
  "Cliente",
];
const FANTASIA_HEADERS = [
  "N Fantasia",
  "Nome Fantasia",
  "Nome Reduzido",
  "Fantasia",
  "A1_NREDUZ",
];
const CODIGO_HEADERS = [
  "Cod Cliente",
  "Cód Cliente",
  "Codigo Cliente",
  "Código Cliente",
  "Codigo",
  "Código",
  "Cod",
  "A1_COD",
];
const LOJA_HEADERS = ["Loja", "A1_LOJA"];
const CNPJ_HEADERS = ["CNPJ", "CNPJ/CPF", "CPF/CNPJ", "CGC", "A1_CGC", "Documento"];
const MUNICIPIO_HEADERS = ["Municipio", "Município", "Cidade", "A1_MUN"];
const UF_HEADERS = ["UF", "Estado", "A1_EST"];
const COD_VENDEDOR_HEADERS = [
  "Cod Vendedor",
  "Cód Vendedor",
  "Codigo Vendedor",
  "Código Vendedor",
  "Cod Vend",
  "A1_VEND",
  "A3_COD",
];
// Nome do dono da carteira — o campo que a análise inteira usa.
const NOME_VENDEDOR_HEADERS = [
  "Nome Vendedor",
  "Nome do Vendedor",
  "Nome vend",
  "Vendedor Nome",
  "Descricao Vendedor",
  "Descrição Vendedor",
  "A3_NOME",
  "Representante",
];

interface ColIdx {
  nome: number;
  fantasia: number | null;
  codigo: number | null;
  loja: number | null;
  cnpj: number | null;
  municipio: number | null;
  uf: number | null;
  codVendedor: number | null;
  nomeVendedor: number | null;
}

/**
 * Procura a linha de cabeçalho (até as 12 primeiras) que tenha uma coluna de
 * nome de cliente. Resolve "Vendedor" genérico: se não houver coluna explícita
 * de NOME do vendedor, a coluna "Vendedor" é usada como nome (e o parser avisa).
 */
function findHeader(rows: unknown[][]): { headerRowIdx: number; cols: ColIdx; vendedorGenerico: boolean } | null {
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const idx = buildHeaderIndex(rows[i] ?? []);
    const nome = findCol(idx, ...NOME_HEADERS);
    if (nome === null) continue;

    let nomeVendedor = findCol(idx, ...NOME_VENDEDOR_HEADERS);
    let codVendedor = findCol(idx, ...COD_VENDEDOR_HEADERS);
    let vendedorGenerico = false;
    if (nomeVendedor === null) {
      const generico = findCol(idx, "Vendedor", "Vend");
      // Só vale como nome se não for a mesma coluna já lida como código.
      if (generico !== null && generico !== codVendedor) {
        nomeVendedor = generico;
        vendedorGenerico = true;
      }
    }
    if (codVendedor !== null && codVendedor === nomeVendedor) codVendedor = null;

    return {
      headerRowIdx: i,
      cols: {
        nome,
        fantasia: findCol(idx, ...FANTASIA_HEADERS),
        codigo: findCol(idx, ...CODIGO_HEADERS),
        loja: findCol(idx, ...LOJA_HEADERS),
        cnpj: findCol(idx, ...CNPJ_HEADERS),
        municipio: findCol(idx, ...MUNICIPIO_HEADERS),
        uf: findCol(idx, ...UF_HEADERS),
        codVendedor,
        nomeVendedor,
      },
      vendedorGenerico,
    };
  }
  return null;
}

/** true quando o valor da célula é, na verdade, o rótulo da própria coluna. */
function isHeaderLabel(value: string, headers: string[]): boolean {
  const norm = normalizeHeader(value);
  return headers.some((h) => normalizeHeader(h) === norm);
}

/** Mantém só os dígitos de um CNPJ/CPF (null quando não sobra nada). */
function onlyDigits(value: unknown): string | null {
  const s = toCleanString(value);
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

/** UF em 2 letras maiúsculas; qualquer outra coisa vira null. */
function toUf(value: unknown): string | null {
  const s = toCleanString(value);
  if (!s) return null;
  const up = s.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(up) ? up : null;
}

export async function parseCarteiraCliente(
  buffer: Buffer,
): Promise<ParseResult<CarteiraClienteRow>> {
  const warnings: string[] = [];
  let sheets: SheetData[];
  try {
    sheets = await readExcelWorkbook(buffer);
  } catch (err) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["Falha ao abrir o XLSX: " + (err instanceof Error ? err.message : String(err))],
    };
  }

  const rows: CarteiraClienteRow[] = [];
  let skipped = 0;
  let semVendedor = 0;
  let abasLidas = 0;

  for (const sheet of sheets) {
    const found = findHeader(sheet.rows);
    if (!found) continue;
    abasLidas++;
    if (found.cols.nomeVendedor === null) {
      warnings.push(
        `aba "${sheet.name}": nenhuma coluna de vendedor encontrada — os cadastros entram sem dono de carteira`,
      );
    } else if (found.vendedorGenerico) {
      warnings.push(
        `aba "${sheet.name}": usando a coluna "Vendedor" como nome do dono da carteira (não há coluna "Nome Vendedor")`,
      );
    }

    for (let r = found.headerRowIdx + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? [];
      const cliente = toCleanString(row[found.cols.nome]);
      if (!cliente) {
        // Linha vazia ou rodapé/quebra de página: ignora em silêncio quando não
        // há nada na linha; conta como skipped quando havia algum conteúdo.
        if (row.some((c) => toCleanString(c) !== null)) skipped++;
        continue;
      }
      // Repetição do cabeçalho (quebra de página do Protheus): a própria célula
      // do nome traz de volta o rótulo da coluna.
      if (isHeaderLabel(cliente, NOME_HEADERS)) continue;

      const clienteKey = normalizeClienteKey(cliente);
      if (!clienteKey) {
        skipped++;
        continue;
      }
      const codigoCliente = found.cols.codigo !== null ? toCleanString(row[found.cols.codigo]) : null;
      const loja = found.cols.loja !== null ? toCleanString(row[found.cols.loja]) : null;
      const nomeFantasia = found.cols.fantasia !== null ? toCleanString(row[found.cols.fantasia]) : null;
      const nomeVendedor =
        found.cols.nomeVendedor !== null ? toCleanString(row[found.cols.nomeVendedor]) : null;
      if (!nomeVendedor) semVendedor++;

      rows.push({
        chaveCadastro: codigoCliente ? `${codigoCliente}/${loja ?? ""}` : clienteKey,
        codigoCliente,
        loja,
        cliente,
        nomeFantasia,
        clienteKey,
        fantasiaKey: nomeFantasia ? normalizeClienteKey(nomeFantasia) || null : null,
        cnpj: found.cols.cnpj !== null ? onlyDigits(row[found.cols.cnpj]) : null,
        municipio: found.cols.municipio !== null ? toCleanString(row[found.cols.municipio]) : null,
        uf: found.cols.uf !== null ? toUf(row[found.cols.uf]) : null,
        codVendedor: found.cols.codVendedor !== null ? toCleanString(row[found.cols.codVendedor]) : null,
        nomeVendedor,
      });
    }
  }

  if (abasLidas === 0) {
    return {
      rows: [],
      skipped: 0,
      warnings: [
        "nenhuma aba com coluna de nome do cliente (Razão Social / Nome / Cliente). Confira o relatório exportado do Protheus.",
      ],
    };
  }

  // Dedup por cadastro (código/loja). A ÚLTIMA ocorrência vence — o Protheus
  // pode repetir o cadastro em quebras de página.
  const seen = new Map<string, number>();
  const deduped: CarteiraClienteRow[] = [];
  for (const r of rows) {
    const ix = seen.get(r.chaveCadastro);
    if (ix !== undefined) deduped[ix] = r;
    else {
      seen.set(r.chaveCadastro, deduped.length);
      deduped.push(r);
    }
  }
  if (deduped.length !== rows.length) {
    warnings.push(`${rows.length - deduped.length} cadastro(s) duplicado(s) consolidado(s)`);
  }
  if (semVendedor > 0) {
    warnings.push(`${semVendedor} cadastro(s) sem nome de vendedor (ficam como "Sem carteira")`);
  }

  return { rows: deduped, skipped, warnings };
}
