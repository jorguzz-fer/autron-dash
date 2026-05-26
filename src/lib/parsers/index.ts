import { Dataset } from "@prisma/client";
import { parsePedido } from "./pedido";
import { parseFollowUp } from "./followup";
import { parseEstoque } from "./estoque";
import { parseFaturamento } from "./faturamento";
import { parseClassificacao } from "./classificacao";
import { parseMetas } from "./metas";
import { parsePloomes } from "./ploomes";
import { parseAnaliticoComissao } from "./comissao/analitico";
import { parseMetasComissao } from "./comissao/metas";

export const PARSERS = {
  PEDIDO: parsePedido,
  FOLLOWUP: parseFollowUp,
  ESTOQUE: parseEstoque,
  FATURAMENTO: parseFaturamento,
  CLASSIFICACAO: parseClassificacao,
  META: parseMetas,
  PLOOMES: parsePloomes,
  COMISSAO_ANALITICO: parseAnaliticoComissao,
  COMISSAO_META: parseMetasComissao,
} as const;

export const DATASET_LABELS: Record<Dataset, string> = {
  PEDIDO: "Pedidos (entrada_pedido.xlsx)",
  FOLLOWUP: "Follow-up (followup.xlsx)",
  ESTOQUE: "Estoque (mata010.xlsx)",
  FATURAMENTO: "Faturamento (faturamento.xlsx)",
  CLASSIFICACAO: "Classificação Comprando/Produzindo (sciozvs0.csv)",
  META: "Metas Budget (Metas_Budget_Grupo_Autron_<ano>.xlsx)",
  PLOOMES: "Ploomes — Oportunidades Ganhas (Ganhas.xlsx)",
  COMISSAO_ANALITICO: "Comissões — Analítico (comissao_analitico.xlsx)",
  COMISSAO_META: "Comissões — Metas (comissao_metas.xlsx)",
};

export const DATASET_ACCEPTS: Record<Dataset, string> = {
  PEDIDO: ".xlsx",
  FOLLOWUP: ".xlsx",
  ESTOQUE: ".xlsx",
  FATURAMENTO: ".xlsx",
  CLASSIFICACAO: ".csv",
  META: ".xlsx",
  PLOOMES: ".xlsx",
  COMISSAO_ANALITICO: ".xlsx",
  COMISSAO_META: ".xlsx",
};

export type { PedidoRow } from "./pedido";
export type { FollowUpRow } from "./followup";
export type { EstoqueRow } from "./estoque";
export type { FaturamentoRow } from "./faturamento";
export type { ClassificacaoRow } from "./classificacao";
export type { MetaRow } from "./metas";
export type { PloomesRow } from "./ploomes";
