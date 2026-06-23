// src/lib/parsers/comissao/analitico.ts
import { readExcelWorkbook } from "../excel";
import {
  ParseResult,
  buildHeaderIndex,
  findCol,
  toCleanString,
  toDate,
  toDecimalStr,
  toInt,
} from "../types";

export interface AnaliticoRow {
  numeroPedido: string;
  itemPedido: string | null;
  dataEmissao: Date | null;
  codCliente: string | null;
  cliente: string | null;
  produto: string | null;
  quantidade: number | null;
  valor: string; // Decimal string for Prisma
  comissaoPct: string | null; // "Informe o Percentual" ÷ 100 (Decimal string); null = usa % do cargo
  codVendedor: string;
  tipoNegocio: string | null;
  dataEntrega: Date | null;
  dataVencimento: Date | null;
  dataPagamento: Date | null;
  condicaoPagamento: string | null;
  parcela: number | null;
  pctRateio: string; // Decimal string
  classificacao: "PREVISTO" | "FATURADO" | "PAGO";
}

/** "000022 - ADRIANO" → { codigo: "000022", nome: "ADRIANO" } */
function splitCodigo(s: string | null): { codigo: string | null; nome: string | null } {
  if (!s) return { codigo: null, nome: null };
  const idx = s.indexOf(" - ");
  if (idx === -1) return { codigo: s.trim(), nome: null };
  return { codigo: s.slice(0, idx).trim(), nome: s.slice(idx + 3).trim() };
}

function mapClassificacao(s: string | null): "PREVISTO" | "FATURADO" | "PAGO" {
  const n = (s ?? "")
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip accents
  if (n === "pago") return "PAGO";
  if (n === "faturado") return "FATURADO";
  return "PREVISTO";
}

export async function parseAnaliticoComissao(buffer: Buffer): Promise<ParseResult<AnaliticoRow>> {
  const sheets = await readExcelWorkbook(buffer);
  if (sheets.length === 0) {
    return { rows: [], skipped: 0, warnings: ["arquivo sem abas"] };
  }

  // Use first sheet (Analítico consolidado is typically a single-sheet report)
  const sheet = sheets[0];
  const allRows = sheet.rows;

  // Find header row (try rows 0-3)
  let headerRowIndex: number | null = null;
  for (const candidate of [0, 1, 2, 3]) {
    if (allRows.length <= candidate) continue;
    const idx = buildHeaderIndex(allRows[candidate]);
    if (idx.has("numerodopedido") || idx.has("numeropedido")) {
      headerRowIndex = candidate;
      break;
    }
  }
  if (headerRowIndex === null) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["coluna 'Número do Pedido' não encontrada — verifique o arquivo"],
    };
  }

  const idx = buildHeaderIndex(allRows[headerRowIndex]);

  // Map columns (tolerant to accent/case variations)
  const cNumeroPedido = findCol(idx, "Número do Pedido", "Numero do Pedido", "Numero Pedido", "No do Pedido");
  const cDataEmissao = findCol(idx, "Data Emissão Pedido Venda", "Data Emissao Pedido Venda", "Data Emissão Pedido", "Data Emissao Pedido", "Data Emissão", "Data Emissao");
  const cCliente = findCol(idx, "Nome do Cliente", "Cliente");
  const cProduto = findCol(idx, "Informe o Nome do produto", "Nome do produto", "Produto");
  const cQuantidade = findCol(idx, "Quantidade do Pedido", "Quantidade", "Qtd");
  const cValor = findCol(idx, "Valor c/ Var. Cambial", "Valor c/ Var Cambial", "Valor", "Vlr c/ Var. Cambial");
  const cPercentual = findCol(idx, "Informe o Percentual", "Percentual", "% Comissao", "% Comissão");
  const cVendedor = findCol(idx, "Nome do Vendedor", "Vendedor");
  const cDataEntrega = findCol(idx, "Data da Entrega", "Data Entrega");
  const cTipoNegocio = findCol(idx, "Tipo Negocio", "Tipo de Negocio", "Tipo de Negócio", "Tipo Negócio");
  const cDataVencimento = findCol(idx, "Data de Vencimento", "Data Vencimento", "Vencimento");
  const cDataPagamento = findCol(idx, "Data Pagamento do título", "Data Pagamento do titulo", "Data Pagamento", "Dt Pagamento");
  const cCondicaoPagamento = findCol(idx, "Condicao de Pagamento", "Condição de Pagamento", "Condicao Pagamento");
  const cParcela = findCol(idx, "Parcela do Titulo", "Parcela do Título", "Parcela");
  const cPctRateio = findCol(idx, "% Rateio Pg", "% Rateio", "Pct Rateio");
  const cClassificacao = findCol(idx, "Classificação da Comissao", "Classificacao da Comissao", "Classificação da Comissão", "Classificação", "Classificacao");

  if (cNumeroPedido === null) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["coluna 'Número do Pedido' não mapeada no header encontrado"],
    };
  }

  const rows: AnaliticoRow[] = [];
  let skipped = 0;

  for (let r = headerRowIndex + 1; r < allRows.length; r++) {
    const row = allRows[r];

    const numeroPedidoRaw = toCleanString(row[cNumeroPedido]);
    if (!numeroPedidoRaw) {
      skipped++;
      continue;
    }

    // Vendedor: required
    const vendedorRaw = cVendedor !== null ? toCleanString(row[cVendedor]) : null;
    const { codigo: codVendedor } = splitCodigo(vendedorRaw);
    if (!codVendedor) {
      skipped++;
      continue;
    }

    // Valor: required
    const valorRaw = cValor !== null ? toDecimalStr(row[cValor]) : null;
    if (!valorRaw) {
      skipped++;
      continue;
    }

    // Data Emissão: required
    const dataEmissaoRaw = cDataEmissao !== null ? toDate(row[cDataEmissao]) : null;
    if (!dataEmissaoRaw) {
      skipped++;
      continue;
    }

    // Cliente split
    const clienteRaw = cCliente !== null ? toCleanString(row[cCliente]) : null;
    const { codigo: codCliente, nome: clienteNome } = splitCodigo(clienteRaw);

    // Produto split (codigo used as itemPedido for dedup key)
    const prod = splitCodigo(cProduto !== null ? toCleanString(row[cProduto]) : null);

    // % por linha: vem como 1; 0,5; 1,3 (percentual) -> divide por 100.
    const pctRaw = cPercentual !== null ? toDecimalStr(row[cPercentual]) : null;
    const comissaoPct =
      pctRaw != null && pctRaw !== "" ? (Number(pctRaw) / 100).toString() : null;

    rows.push({
      numeroPedido: numeroPedidoRaw,
      itemPedido: prod.codigo,
      dataEmissao: dataEmissaoRaw,
      codCliente,
      cliente: clienteNome,
      produto: cProduto !== null ? toCleanString(row[cProduto]) : null,
      quantidade: cQuantidade !== null ? toInt(row[cQuantidade]) : null,
      valor: valorRaw,
      comissaoPct,
      codVendedor,
      tipoNegocio: cTipoNegocio !== null ? toCleanString(row[cTipoNegocio]) : null,
      dataEntrega: cDataEntrega !== null ? toDate(row[cDataEntrega]) : null,
      dataVencimento: cDataVencimento !== null ? toDate(row[cDataVencimento]) : null,
      dataPagamento: cDataPagamento !== null ? toDate(row[cDataPagamento]) : null,
      condicaoPagamento: cCondicaoPagamento !== null ? toCleanString(row[cCondicaoPagamento]) : null,
      parcela: cParcela !== null ? toInt(row[cParcela]) : null,
      pctRateio: (cPctRateio !== null ? toDecimalStr(row[cPctRateio]) : null) ?? "100",
      classificacao: mapClassificacao(cClassificacao !== null ? toCleanString(row[cClassificacao]) : null),
    });
  }

  return { rows, skipped, warnings: [] };
}
