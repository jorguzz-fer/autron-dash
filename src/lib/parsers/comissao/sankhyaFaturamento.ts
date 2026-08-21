// src/lib/parsers/comissao/sankhyaFaturamento.ts
//
// Pilar 2 da comissão pós-migração (ago/2026): FATURAMENTO exportado do
// Sankhya. Não gera ação imediata — é previsibilidade (o pagamento, Pilar 3,
// é o que dispara a comissão). Apuração do 1º ao último dia do mês.
//
// Layout (validado com Faturamento_Comissao.xlsx, ago/2026):
//   Numero_Autron | Numero_Nota_Fiscal | Emissao_Nota_Fiscal |
//   PV_sistema_anterior_ou_outra_referencia | Codigo_Cliente | Nome_Cliente |
//   Referencia | Descricao_Produto | Quantidade_Produtos | Valor_Total_Item |
//   Codigo_Vendedor | Nome_Vendedor | Data_Entrega | Tipo_Negocio | Tipo_Venda |
//   Codigo_Tipo_Negociacao | Condicao_Pagamento | Prazo_Parcela | Data_Vencimento
//
// Particularidades observadas na amostra real:
//   - "PV_sistema_anterior…" carrega o DE-PARA com o Protheus ("PV 21778 - …",
//     às vezes só "21454") ou uma referência Ploomes/produto. O nº Protheus é
//     extraído em `pedidoProtheus` para casar com os lançamentos jan–jul.
//   - Valor NEGATIVO = devolução do mês corrente (pode vir sem Numero_Autron
//     e sem PV — sem vínculo com o pedido de origem; warning).
//   - Uma NF tem várias linhas (uma por item).
//   - Prazo_Parcela/Data_Vencimento trazem UMA parcela por linha; condições
//     "30/45 DDL" sugerem parcelas adicionais que o export não desdobra —
//     confirmar com a origem (ou o desdobramento vem no Pilar 3).

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

export interface SankhyaFaturamentoRow {
  numeroNF: string;
  dataEmissaoNF: Date;
  /** Pedido Sankhya de origem; null nas devoluções sem vínculo. */
  numeroPedidoSankhya: string | null;
  /** Conteúdo bruto de "PV_sistema_anterior_ou_outra_referencia". */
  refAnterior: string | null;
  /** Nº do pedido no Protheus extraído de refAnterior (de-para), se houver. */
  pedidoProtheus: string | null;
  codClienteSankhya: string | null;
  nomeCliente: string | null;
  referencia: string | null;
  descricaoProduto: string | null;
  quantidade: number | null;
  valor: string;               // negativo = devolução
  devolucao: boolean;
  codVendedorSankhya: string;
  nomeVendedor: string | null;
  dataEntrega: Date | null;
  tipoNegocio: string | null;
  tipoVenda: string | null;
  codigoTipoNegociacao: string | null;
  condicaoPagamento: string | null;
  prazoParcela: number | null; // dias
  dataVencimento: Date | null;
}

/** "PV 21778 - 34960_Mercotac…" → "21778"; "21454" → "21454"; Ploomes/produto → null. */
export function extraiPedidoProtheus(ref: string | null): string | null {
  if (!ref) return null;
  const pv = /\bPV\s*0*(\d{3,6})\b/i.exec(ref);
  if (pv) return pv[1];
  const soNumero = /^\s*0*(\d{3,6})\s*$/.exec(ref);
  return soNumero ? soNumero[1] : null;
}

export async function parseSankhyaFaturamento(
  buffer: Buffer,
): Promise<ParseResult<SankhyaFaturamentoRow>> {
  const allRows = await readExcelRows(buffer);
  const headerRowIndex = allRows.findIndex((r) =>
    r.some((c) => normalizeHeader(toCleanString(c)) === "numeronotafiscal"),
  );
  if (headerRowIndex < 0) {
    return {
      rows: [],
      skipped: 0,
      warnings: ["cabeçalho não encontrado (sem coluna Numero_Nota_Fiscal) — é a planilha de Faturamento do Sankhya?"],
    };
  }

  const idx = buildHeaderIndex(allRows[headerRowIndex]);
  const cPedido = findCol(idx, "numeroautron");
  const cNF = findCol(idx, "numeronotafiscal");
  const cEmissao = findCol(idx, "emissaonotafiscal");
  const cRefAnterior = findCol(idx, "pvsistemaanteriorououtrareferencia");
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
  const cCodTipoNeg = findCol(idx, "codigotiponegociacao");
  const cCondPag = findCol(idx, "condicaopagamento");
  const cPrazoParcela = findCol(idx, "prazoparcela");
  const cVencimento = findCol(idx, "datavencimento");

  const rows: SankhyaFaturamentoRow[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  const devolucoes: string[] = [];
  const semVinculo: string[] = [];
  let semTipoVenda = 0;

  for (let r = headerRowIndex + 1; r < allRows.length; r++) {
    const row = allRows[r];
    const numeroNF = cNF !== null ? toCleanString(row[cNF]) : null;
    if (!numeroNF) {
      if (row.some((c) => toCleanString(c) !== null)) skipped++;
      continue;
    }
    const valor = cValor !== null ? toDecimalStr(row[cValor]) : null;
    const dataEmissaoNF = cEmissao !== null ? toDate(row[cEmissao]) : null;
    if (!valor || !dataEmissaoNF) {
      warnings.push(`NF ${numeroNF}: linha sem valor ou sem data de emissão — ignorada`);
      skipped++;
      continue;
    }
    const codVendedor = cCodVendedor !== null ? toCleanString(row[cCodVendedor]) : null;
    if (!codVendedor) {
      warnings.push(`NF ${numeroNF}: sem código de vendedor — ignorada`);
      skipped++;
      continue;
    }

    const numeroPedidoSankhya = cPedido !== null ? toCleanString(row[cPedido]) : null;
    const refAnterior = cRefAnterior !== null ? toCleanString(row[cRefAnterior]) : null;
    const pedidoProtheus = extraiPedidoProtheus(refAnterior);
    const devolucao = Number(valor) < 0;

    if (devolucao) devolucoes.push(numeroNF);
    if (!numeroPedidoSankhya && !pedidoProtheus) semVinculo.push(numeroNF);

    const tipoVenda = cTipoVenda !== null ? toCleanString(row[cTipoVenda]) : null;
    if (!tipoVenda) semTipoVenda++;

    rows.push({
      numeroNF,
      dataEmissaoNF,
      numeroPedidoSankhya,
      refAnterior,
      pedidoProtheus,
      codClienteSankhya: cCodCliente !== null ? toCleanString(row[cCodCliente]) : null,
      nomeCliente: cNomeCliente !== null ? toCleanString(row[cNomeCliente]) : null,
      referencia: cReferencia !== null ? toCleanString(row[cReferencia]) : null,
      descricaoProduto: cDescricao !== null ? toCleanString(row[cDescricao]) : null,
      quantidade: cQuantidade !== null ? toInt(row[cQuantidade]) : null,
      valor,
      devolucao,
      codVendedorSankhya: codVendedor,
      nomeVendedor: cNomeVendedor !== null ? toCleanString(row[cNomeVendedor]) : null,
      dataEntrega: cDataEntrega !== null ? toDate(row[cDataEntrega]) : null,
      tipoNegocio: cTipoNegocio !== null ? toCleanString(row[cTipoNegocio]) : null,
      tipoVenda,
      codigoTipoNegociacao: cCodTipoNeg !== null ? toCleanString(row[cCodTipoNeg]) : null,
      condicaoPagamento: cCondPag !== null ? toCleanString(row[cCondPag]) : null,
      prazoParcela: cPrazoParcela !== null ? toInt(row[cPrazoParcela]) : null,
      dataVencimento: cVencimento !== null ? toDate(row[cVencimento]) : null,
    });
  }

  if (devolucoes.length > 0) {
    warnings.push(`${devolucoes.length} linha(s) de devolução (valor negativo): NF ${[...new Set(devolucoes)].join(", ")}`);
  }
  if (semVinculo.length > 0) {
    warnings.push(`${semVinculo.length} linha(s) sem nº de pedido Sankhya nem PV do Protheus: NF ${[...new Set(semVinculo)].join(", ")} — sem vínculo com o pedido de origem`);
  }
  if (semTipoVenda > 0) warnings.push(`${semTipoVenda} linha(s) sem Tipo_Venda (origem já acionada)`);
  if (rows.length === 0) warnings.push("nenhuma linha de faturamento encontrada");

  return { rows, skipped, warnings };
}
