// src/lib/parsers/comissao/sankhyaPedidos.ts
//
// Pilar 1 da comissão pós-migração (ago/2026): ENTRADA DE PEDIDO exportada do
// Sankhya. É o relatório que inicia a comissão — a entrada de pedido decide a
// elegibilidade (gatilho no acumulado). Apuração do 1º ao último dia do mês.
//
// Layout (validado com Entrada_PV_Comissao.xlsx, ago/2026):
//   Numero_Autron | Emissao_Pedido | Codigo_Cliente | Nome_Cliente | Referencia |
//   Descricao_Produto | Quantidade_Produtos | Valor_Total_Item | Codigo_Vendedor |
//   Nome_Vendedor | Data_Entrega | Tipo_Negocio | Tipo_Venda |
//   Data_Previsão_Vencimento | Condicao_Pagamento
//
// Particularidades observadas na amostra real:
//   - Datas vêm como TEXTO "dd/mm/yyyy hh:mm:ss" (toDate resolve).
//   - Códigos são do SANKHYA (vendedor 3, 5, 7…), NÃO do Protheus — o de-para
//     é feito na importação, não aqui.
//   - Um mesmo pedido pode repetir a MESMA Referencia em linhas distintas e
//     legítimas (ex.: pedido 308, qtd/valores diferentes). Por isso cada linha
//     ganha `sequencia` (1-based dentro do pedido) — sem ela, a dedup por
//     pedido|item colapsaria linhas reais.
//   - Linhas 100% idênticas no mesmo pedido podem ser duplicação do export —
//     entram no resultado, mas geram warning para conferência na origem.
//   - Codigo_Vendedor 1 / "VENDEDOR" é placeholder de pedido sem vendedor
//     atribuído — entra com warning (comissão de ninguém até corrigirem).

import { readExcelRows } from "../excel";
import {
  ParseResult,
  toCleanString,
  toDecimalStr,
  toDate,
  toInt,
  normalizeHeader,
  buildHeaderIndex,
  findCol,
} from "../types";

export interface SankhyaPedidoRow {
  numeroPedido: string;        // Numero_Autron (numeração do Sankhya)
  /** Nº da linha dentro do pedido (1-based), na ordem do arquivo. */
  sequencia: number;
  dataEmissao: Date;
  codClienteSankhya: string | null;
  nomeCliente: string | null;
  referencia: string | null;   // código do produto
  descricaoProduto: string | null;
  quantidade: number | null;
  valor: string;               // Valor_Total_Item (Decimal string)
  codVendedorSankhya: string;  // código Sankhya — mapear p/ Protheus na importação
  nomeVendedor: string | null;
  dataEntrega: Date | null;
  tipoNegocio: string | null;  // Cliente Final | OEM | REVENDA
  tipoVenda: string | null;    // RE | NO | null (origem ainda corrigindo)
  dataPrevVencimento: Date | null;
  condicaoPagamento: string | null;
}

export async function parseSankhyaPedidos(
  buffer: Buffer,
): Promise<ParseResult<SankhyaPedidoRow>> {
  const allRows = await readExcelRows(buffer);
  const headerRowIndex = allRows.findIndex((r) =>
    r.some((c) => normalizeHeader(toCleanString(c)) === "numeroautron"),
  );
  if (headerRowIndex < 0) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["cabeçalho não encontrado (sem coluna Numero_Autron) — é a planilha de Entrada de PV do Sankhya?"],
    };
  }

  const idx = buildHeaderIndex(allRows[headerRowIndex]);
  const cPedido = findCol(idx, "numeroautron");
  const cEmissao = findCol(idx, "emissaopedido");
  const cCodCliente = findCol(idx, "codigocliente");
  const cNomeCliente = findCol(idx, "nomecliente");
  const cReferencia = findCol(idx, "referencia");
  const cDescricao = findCol(idx, "descricaoproduto");
  const cQuantidade = findCol(idx, "quantidadeprodutos");
  const cValor = findCol(idx, "valortotalitem");
  const cCodVendedor = findCol(idx, "codigovendedor");
  const cNomeVendedor = findCol(idx, "nomevendedor");
  const cDataEntrega = findCol(idx, "dataentrega");
  const cTipoNegocio = findCol(idx, "tiponegocio");
  const cTipoVenda = findCol(idx, "tipovenda");
  const cPrevVenc = findCol(idx, "dataprevisaovencimento");
  const cCondPag = findCol(idx, "condicaopagamento");

  const rows: SankhyaPedidoRow[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  const seqPorPedido = new Map<string, number>();
  const linhasVistas = new Map<string, string>(); // assinatura → 1º pedido/linha
  const semVendedor: string[] = [];
  const duplicadas: string[] = [];
  let semTipoVenda = 0;
  let semDataEntrega = 0;

  for (let r = headerRowIndex + 1; r < allRows.length; r++) {
    const row = allRows[r];
    const numeroPedido = cPedido !== null ? toCleanString(row[cPedido]) : null;
    if (!numeroPedido) {
      if (row.some((c) => toCleanString(c) !== null)) skipped++;
      continue;
    }
    const valor = cValor !== null ? toDecimalStr(row[cValor]) : null;
    const dataEmissao = cEmissao !== null ? toDate(row[cEmissao]) : null;
    if (!valor || !dataEmissao) {
      warnings.push(`pedido ${numeroPedido}: linha sem valor ou sem data de emissão — ignorada`);
      skipped++;
      continue;
    }

    const codVendedor = cCodVendedor !== null ? toCleanString(row[cCodVendedor]) : null;
    const nomeVendedor = cNomeVendedor !== null ? toCleanString(row[cNomeVendedor]) : null;
    if (!codVendedor) {
      warnings.push(`pedido ${numeroPedido}: sem código de vendedor — ignorado`);
      skipped++;
      continue;
    }
    // Placeholder do Sankhya para pedido sem vendedor atribuído
    if (normalizeHeader(nomeVendedor) === "vendedor") semVendedor.push(numeroPedido);

    const tipoVenda = cTipoVenda !== null ? toCleanString(row[cTipoVenda]) : null;
    if (!tipoVenda) semTipoVenda++;
    const dataEntrega = cDataEntrega !== null ? toDate(row[cDataEntrega]) : null;
    if (!dataEntrega) semDataEntrega++;

    const referencia = cReferencia !== null ? toCleanString(row[cReferencia]) : null;
    const quantidade = cQuantidade !== null ? toInt(row[cQuantidade]) : null;

    const sequencia = (seqPorPedido.get(numeroPedido) ?? 0) + 1;
    seqPorPedido.set(numeroPedido, sequencia);

    const assinatura = `${numeroPedido}|${referencia}|${quantidade}|${valor}`;
    if (linhasVistas.has(assinatura)) duplicadas.push(`${numeroPedido} (${referencia})`);
    else linhasVistas.set(assinatura, numeroPedido);

    rows.push({
      numeroPedido,
      sequencia,
      dataEmissao,
      codClienteSankhya: cCodCliente !== null ? toCleanString(row[cCodCliente]) : null,
      nomeCliente: cNomeCliente !== null ? toCleanString(row[cNomeCliente]) : null,
      referencia,
      descricaoProduto: cDescricao !== null ? toCleanString(row[cDescricao]) : null,
      quantidade,
      valor,
      codVendedorSankhya: codVendedor,
      nomeVendedor,
      dataEntrega,
      tipoNegocio: cTipoNegocio !== null ? toCleanString(row[cTipoNegocio]) : null,
      tipoVenda,
      dataPrevVencimento: cPrevVenc !== null ? toDate(row[cPrevVenc]) : null,
      condicaoPagamento: cCondPag !== null ? toCleanString(row[cCondPag]) : null,
    });
  }

  if (semVendedor.length > 0) {
    warnings.push(`${semVendedor.length} pedido(s) com vendedor genérico "VENDEDOR" (sem atribuição): ${semVendedor.join(", ")} — corrigir na origem`);
  }
  if (duplicadas.length > 0) {
    warnings.push(`${duplicadas.length} linha(s) idêntica(s) repetida(s) no mesmo pedido: ${[...new Set(duplicadas)].join(", ")} — conferir se é item repetido real ou duplicação do export`);
  }
  if (semTipoVenda > 0) warnings.push(`${semTipoVenda} linha(s) sem Tipo_Venda (origem já acionada)`);
  if (semDataEntrega > 0) warnings.push(`${semDataEntrega} linha(s) sem Data_Entrega (origem já acionada)`);
  if (rows.length === 0) warnings.push("nenhuma linha de pedido encontrada");

  return { rows, skipped, warnings };
}
