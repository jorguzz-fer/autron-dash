// src/lib/sankhya/queries.ts
//
// Consultas na API do Sankhya para os 3 pilares da comissão pós-migração
// (plano: docs/superpowers/plans/2026-08-20-migracao-sankhya-comissoes.md):
//
//   Pilar 1 — ENTRADA DE PEDIDOS  (decide elegibilidade / gatilho 70%)
//   Pilar 2 — FATURAMENTO         (previsibilidade)
//   Pilar 3 — PAGAMENTOS          (dispara o pagamento da comissão)
//
// As consultas espelham os exports do Sílvio (Entrada_PV_Comissao.xlsx /
// Faturamento_Comissao.xlsx) usando as tabelas padrão do Sankhya:
//
//   TGFCAB cabeçalho de pedidos/notas   TGFITE itens
//   TGFPAR parceiros (clientes)         TGFPRO produtos
//   TGFVEN vendedores                   TGFFIN financeiro (títulos/baixas)
//
// ⚠ CAMPOS A CONFIRMAR quando a credencial chegar (ver `CAMPOS` abaixo):
// "Tipo_Negocio", "Tipo_Venda", "PV_sistema_anterior…" e o desconto da
// oportunidade costumam ser campos ADICIONAIS (AD_*) criados na implantação —
// o nome exato é definido pela consultoria (Rogério). Os TIPMOV de pedido/
// venda/devolução também dependem dos TOPs configurados na Autron.
//
// Caminho preferido: DbExplorerSP.executeQuery (SELECT com joins, reproduz o
// export numa chamada). Se o serviço não estiver liberado para o usuário da
// integração, `fetchVendedores`/consultas simples já funcionam via
// loadRecords, e as demais podem ser portadas para loadRecords depois.

import { executeQuery, loadRecords, type SankhyaRecord } from "./client";

/**
 * Nomes de campos/valores que dependem da implantação da Autron no Sankhya.
 * Centralizados aqui para o ajuste (pós-credencial) ser pontual.
 */
export const CAMPOS = {
  /** TIPMOV do TGFCAB: P=pedido de venda, V=venda (NF), D=devolução. */
  tipmovPedido: "P",
  tipmovVenda: "V",
  tipmovDevolucao: "D",
  /** CONFIRMAR: campo do "Tipo_Negocio" (Cliente Final/OEM/REVENDA). */
  tipoNegocio: "CAB.AD_TIPONEGOCIO",
  /** CONFIRMAR: campo do "Tipo_Venda" (RE/NO/ME/SU/SE — regra dos representantes). */
  tipoVenda: "CAB.AD_TIPOVENDA",
  /** CONFIRMAR: campo com o PV do sistema anterior (de-para Protheus). */
  refSistemaAnterior: "CAB.AD_PVANTERIOR",
  /** CONFIRMAR: desconto da oportunidade (fator da regra dos representantes). */
  descontoOportunidade: "CAB.AD_DESCONTOOPORT",
} as const;

// ─── Datas ─────────────────────────────────────────────────────────────────

/**
 * Datas chegam em formatos diferentes conforme o serviço:
 *   DbExplorer:  "2026-08-31 00:00:00.0" | "31/08/2026 14:03:22"
 *   loadRecords: "31082026 00:00:00" (ddmmyyyy)
 * Devolve Date em UTC (meia-noite quando sem hora) ou null.
 */
export function parseSankhyaDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const s = value.trim();

  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(s);
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  }
  m = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(s);
  if (m) {
    return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  }
  m = /^(\d{2})(\d{2})(\d{4})(?:[ T](\d{2}):(\d{2}):(\d{2}))?/.exec(s);
  if (m) {
    return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  }
  return null;
}

/** "31/08/2026" no fuso local do ERP — formato aceito nos WHERE do Sankhya. */
function sqlDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export interface Periodo {
  /** Início (inclusivo). */
  inicio: Date;
  /** Fim (inclusivo). */
  fim: Date;
}

function num(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// ─── Pilar 1: entrada de pedidos ───────────────────────────────────────────

export interface PedidoApiRow {
  numeroPedido: string;
  sequencia: number;
  dataEmissao: Date;
  codClienteSankhya: string | null;
  nomeCliente: string | null;
  referencia: string | null;
  descricaoProduto: string | null;
  quantidade: number | null;
  valor: string;
  codVendedorSankhya: string;
  nomeVendedor: string | null;
  dataEntrega: Date | null;
  tipoNegocio: string | null;
  tipoVenda: string | null;
  dataPrevVencimento: Date | null;
  condicaoPagamento: string | null;
}

/**
 * Pilar 1 — itens de pedidos de venda emitidos no período (equivale ao
 * Entrada_PV_Comissao.xlsx). Mesmo shape do parser `sankhyaPedidos`.
 */
export async function fetchEntradaPedidos(periodo: Periodo): Promise<PedidoApiRow[]> {
  const sql = `
    SELECT
      CAB.NUNOTA         AS NUMERO_PEDIDO,
      ITE.SEQUENCIA      AS SEQUENCIA,
      CAB.DTNEG          AS EMISSAO,
      CAB.CODPARC        AS COD_CLIENTE,
      PAR.NOMEPARC       AS NOME_CLIENTE,
      PRO.REFERENCIA     AS REFERENCIA,
      PRO.DESCRPROD      AS DESCRICAO_PRODUTO,
      ITE.QTDNEG         AS QUANTIDADE,
      ITE.VLRTOT         AS VALOR_TOTAL_ITEM,
      CAB.CODVEND        AS COD_VENDEDOR,
      VEN.APELIDO        AS NOME_VENDEDOR,
      CAB.DTPREVENT      AS DATA_ENTREGA,
      ${CAMPOS.tipoNegocio}  AS TIPO_NEGOCIO,
      ${CAMPOS.tipoVenda}    AS TIPO_VENDA,
      CAB.DTVENC         AS DATA_PREV_VENCIMENTO,
      TPV.DESCRTIPVENDA  AS CONDICAO_PAGAMENTO
    FROM TGFCAB CAB
      JOIN TGFITE ITE      ON ITE.NUNOTA = CAB.NUNOTA
      LEFT JOIN TGFPAR PAR ON PAR.CODPARC = CAB.CODPARC
      LEFT JOIN TGFPRO PRO ON PRO.CODPROD = ITE.CODPROD
      LEFT JOIN TGFVEN VEN ON VEN.CODVEND = CAB.CODVEND
      LEFT JOIN TGFTPV TPV ON TPV.CODTIPVENDA = CAB.CODTIPVENDA AND TPV.DHALTER = (
        SELECT MAX(T2.DHALTER) FROM TGFTPV T2 WHERE T2.CODTIPVENDA = CAB.CODTIPVENDA
      )
    WHERE CAB.TIPMOV = '${CAMPOS.tipmovPedido}'
      AND CAB.DTNEG >= TO_DATE('${sqlDate(periodo.inicio)}', 'DD/MM/YYYY')
      AND CAB.DTNEG <  TO_DATE('${sqlDate(periodo.fim)}', 'DD/MM/YYYY') + 1
    ORDER BY CAB.NUNOTA, ITE.SEQUENCIA
  `;
  const records = await executeQuery(sql);
  return records
    .filter((r) => r.NUMERO_PEDIDO && r.EMISSAO && r.VALOR_TOTAL_ITEM !== null)
    .map((r) => ({
      numeroPedido: r.NUMERO_PEDIDO!,
      sequencia: num(r.SEQUENCIA) ?? 0,
      dataEmissao: parseSankhyaDate(r.EMISSAO)!,
      codClienteSankhya: r.COD_CLIENTE,
      nomeCliente: r.NOME_CLIENTE,
      referencia: r.REFERENCIA,
      descricaoProduto: r.DESCRICAO_PRODUTO,
      quantidade: num(r.QUANTIDADE),
      valor: r.VALOR_TOTAL_ITEM!,
      codVendedorSankhya: r.COD_VENDEDOR ?? "1",
      nomeVendedor: r.NOME_VENDEDOR,
      dataEntrega: parseSankhyaDate(r.DATA_ENTREGA),
      tipoNegocio: r.TIPO_NEGOCIO,
      tipoVenda: r.TIPO_VENDA,
      dataPrevVencimento: parseSankhyaDate(r.DATA_PREV_VENCIMENTO),
      condicaoPagamento: r.CONDICAO_PAGAMENTO,
    }));
}

// ─── Pilar 2: faturamento ──────────────────────────────────────────────────

export interface FaturamentoApiRow {
  numeroNF: string;
  dataEmissaoNF: Date;
  numeroPedidoSankhya: string | null;
  refAnterior: string | null;
  codClienteSankhya: string | null;
  nomeCliente: string | null;
  referencia: string | null;
  descricaoProduto: string | null;
  quantidade: number | null;
  valor: string;
  devolucao: boolean;
  codVendedorSankhya: string;
  nomeVendedor: string | null;
  tipoNegocio: string | null;
  tipoVenda: string | null;
  condicaoPagamento: string | null;
}

/**
 * Pilar 2 — itens de NF de venda (e devoluções, com valor negativado)
 * emitidas no período (equivale ao Faturamento_Comissao.xlsx). O pedido de
 * origem vem do vínculo item-a-item do Sankhya (TGFVAR nota ↔ pedido).
 */
export async function fetchFaturamento(periodo: Periodo): Promise<FaturamentoApiRow[]> {
  const sql = `
    SELECT
      CAB.NUMNOTA        AS NUMERO_NF,
      CAB.TIPMOV         AS TIPMOV,
      CAB.DTNEG          AS EMISSAO_NF,
      PED.NUNOTA         AS PEDIDO_ORIGEM,
      ${CAMPOS.refSistemaAnterior} AS REF_ANTERIOR,
      CAB.CODPARC        AS COD_CLIENTE,
      PAR.NOMEPARC       AS NOME_CLIENTE,
      PRO.REFERENCIA     AS REFERENCIA,
      PRO.DESCRPROD      AS DESCRICAO_PRODUTO,
      ITE.QTDNEG         AS QUANTIDADE,
      ITE.VLRTOT         AS VALOR_TOTAL_ITEM,
      CAB.CODVEND        AS COD_VENDEDOR,
      VEN.APELIDO        AS NOME_VENDEDOR,
      ${CAMPOS.tipoNegocio}  AS TIPO_NEGOCIO,
      ${CAMPOS.tipoVenda}    AS TIPO_VENDA,
      TPV.DESCRTIPVENDA  AS CONDICAO_PAGAMENTO
    FROM TGFCAB CAB
      JOIN TGFITE ITE      ON ITE.NUNOTA = CAB.NUNOTA
      LEFT JOIN TGFVAR VAR ON VAR.NUNOTA = ITE.NUNOTA AND VAR.SEQUENCIA = ITE.SEQUENCIA
      LEFT JOIN TGFCAB PED ON PED.NUNOTA = VAR.NUNOTAORIG
      LEFT JOIN TGFPAR PAR ON PAR.CODPARC = CAB.CODPARC
      LEFT JOIN TGFPRO PRO ON PRO.CODPROD = ITE.CODPROD
      LEFT JOIN TGFVEN VEN ON VEN.CODVEND = CAB.CODVEND
      LEFT JOIN TGFTPV TPV ON TPV.CODTIPVENDA = CAB.CODTIPVENDA AND TPV.DHALTER = (
        SELECT MAX(T2.DHALTER) FROM TGFTPV T2 WHERE T2.CODTIPVENDA = CAB.CODTIPVENDA
      )
    WHERE CAB.TIPMOV IN ('${CAMPOS.tipmovVenda}', '${CAMPOS.tipmovDevolucao}')
      AND CAB.STATUSNOTA = 'L'
      AND CAB.DTNEG >= TO_DATE('${sqlDate(periodo.inicio)}', 'DD/MM/YYYY')
      AND CAB.DTNEG <  TO_DATE('${sqlDate(periodo.fim)}', 'DD/MM/YYYY') + 1
    ORDER BY CAB.NUMNOTA, ITE.SEQUENCIA
  `;
  const records = await executeQuery(sql);
  return records
    .filter((r) => r.NUMERO_NF && r.EMISSAO_NF && r.VALOR_TOTAL_ITEM !== null)
    .map((r) => {
      const devolucao = r.TIPMOV === CAMPOS.tipmovDevolucao;
      const bruto = r.VALOR_TOTAL_ITEM!;
      return {
        numeroNF: r.NUMERO_NF!,
        dataEmissaoNF: parseSankhyaDate(r.EMISSAO_NF)!,
        numeroPedidoSankhya: r.PEDIDO_ORIGEM,
        refAnterior: r.REF_ANTERIOR,
        codClienteSankhya: r.COD_CLIENTE,
        nomeCliente: r.NOME_CLIENTE,
        referencia: r.REFERENCIA,
        descricaoProduto: r.DESCRICAO_PRODUTO,
        quantidade: num(r.QUANTIDADE),
        valor: devolucao && !bruto.startsWith("-") ? `-${bruto}` : bruto,
        devolucao,
        codVendedorSankhya: r.COD_VENDEDOR ?? "1",
        nomeVendedor: r.NOME_VENDEDOR,
        tipoNegocio: r.TIPO_NEGOCIO,
        tipoVenda: r.TIPO_VENDA,
        condicaoPagamento: r.CONDICAO_PAGAMENTO,
      };
    });
}

// ─── Pilar 3: pagamentos (baixas do contas a receber) ──────────────────────

export interface PagamentoApiRow {
  nuFin: string;
  numeroNF: string | null;
  numeroPedidoSankhya: string | null;
  refAnterior: string | null;
  parcela: string | null;
  dataVencimento: Date | null;
  dataPagamento: Date;
  valorParcela: string | null;
  valorPago: string;
  codClienteSankhya: string | null;
  nomeCliente: string | null;
  codVendedorSankhya: string | null;
  nomeVendedor: string | null;
}

/**
 * Pilar 3 — títulos do contas a receber BAIXADOS (pagos) no período. É o que
 * dispara a comissão. Cobre também o legado migrado do Protheus: título sem
 * NUNOTA vinculado ainda sai na consulta, com o campo de referência
 * (`refSistemaAnterior`) para o de-para "PV 21xxx" já usado no faturamento.
 */
export async function fetchPagamentos(periodo: Periodo): Promise<PagamentoApiRow[]> {
  const sql = `
    SELECT
      FIN.NUFIN          AS NUFIN,
      FIN.NUMNOTA        AS NUMERO_NF,
      PED.NUNOTA         AS PEDIDO_ORIGEM,
      ${CAMPOS.refSistemaAnterior} AS REF_ANTERIOR,
      FIN.DESDOBRAMENTO  AS PARCELA,
      FIN.DTVENC         AS DATA_VENCIMENTO,
      FIN.DHBAIXA        AS DATA_PAGAMENTO,
      FIN.VLRDESDOB      AS VALOR_PARCELA,
      FIN.VLRBAIXA       AS VALOR_PAGO,
      FIN.CODPARC        AS COD_CLIENTE,
      PAR.NOMEPARC       AS NOME_CLIENTE,
      FIN.CODVEND        AS COD_VENDEDOR,
      VEN.APELIDO        AS NOME_VENDEDOR
    FROM TGFFIN FIN
      LEFT JOIN TGFCAB CAB ON CAB.NUNOTA = FIN.NUNOTA
      LEFT JOIN TGFVAR VAR ON VAR.NUNOTA = CAB.NUNOTA AND VAR.SEQUENCIA = (
        SELECT MIN(V2.SEQUENCIA) FROM TGFVAR V2 WHERE V2.NUNOTA = CAB.NUNOTA
      )
      LEFT JOIN TGFCAB PED ON PED.NUNOTA = VAR.NUNOTAORIG
      LEFT JOIN TGFPAR PAR ON PAR.CODPARC = FIN.CODPARC
      LEFT JOIN TGFVEN VEN ON VEN.CODVEND = FIN.CODVEND
    WHERE FIN.RECDESP = 1
      AND FIN.PROVISAO = 'N'
      AND FIN.DHBAIXA IS NOT NULL
      AND FIN.DHBAIXA >= TO_DATE('${sqlDate(periodo.inicio)}', 'DD/MM/YYYY')
      AND FIN.DHBAIXA <  TO_DATE('${sqlDate(periodo.fim)}', 'DD/MM/YYYY') + 1
    ORDER BY FIN.DHBAIXA, FIN.NUFIN
  `;
  const records = await executeQuery(sql);
  return records
    .filter((r) => r.NUFIN && r.DATA_PAGAMENTO)
    .map((r) => ({
      nuFin: r.NUFIN!,
      numeroNF: r.NUMERO_NF,
      numeroPedidoSankhya: r.PEDIDO_ORIGEM,
      refAnterior: r.REF_ANTERIOR,
      parcela: r.PARCELA,
      dataVencimento: parseSankhyaDate(r.DATA_VENCIMENTO),
      dataPagamento: parseSankhyaDate(r.DATA_PAGAMENTO)!,
      valorParcela: r.VALOR_PARCELA,
      valorPago: r.VALOR_PAGO ?? r.VALOR_PARCELA ?? "0",
      codClienteSankhya: r.COD_CLIENTE,
      nomeCliente: r.NOME_CLIENTE,
      codVendedorSankhya: r.COD_VENDEDOR,
      nomeVendedor: r.NOME_VENDEDOR,
    }));
}

// ─── Cadastro de vendedores (de-para) ──────────────────────────────────────

export interface VendedorApiRow {
  codVendedorSankhya: string;
  nome: string | null;
  ativo: boolean;
}

/**
 * Cadastro de vendedores (pendência 7 do plano: fixar o de-para
 * Sankhya ↔ Protheus sem ambiguidade). Usa loadRecords — funciona mesmo
 * sem o DbExplorer liberado.
 */
export async function fetchVendedores(): Promise<VendedorApiRow[]> {
  const records: SankhyaRecord[] = await loadRecords({
    entity: "Vendedor",
    fields: ["CODVEND", "APELIDO", "ATIVO"],
  });
  return records
    .filter((r) => r.CODVEND)
    .map((r) => ({
      codVendedorSankhya: r.CODVEND!,
      nome: r.APELIDO,
      ativo: r.ATIVO !== "N",
    }));
}
