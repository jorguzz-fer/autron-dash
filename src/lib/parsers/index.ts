import { Dataset } from "@prisma/client";
import { parsePedido } from "./pedido";
import { parseFollowUp } from "./followup";
import { parseEstoque } from "./estoque";
import { parseFaturamento } from "./faturamento";
import { parseClassificacao } from "./classificacao";

export const PARSERS = {
  PEDIDO: parsePedido,
  FOLLOWUP: parseFollowUp,
  ESTOQUE: parseEstoque,
  FATURAMENTO: parseFaturamento,
  CLASSIFICACAO: parseClassificacao,
} as const;

export const DATASET_LABELS: Record<Dataset, string> = {
  PEDIDO: "Pedidos (entrada_pedido.xlsx)",
  FOLLOWUP: "Follow-up (followup.xlsx)",
  ESTOQUE: "Estoque (mata010.xlsx)",
  FATURAMENTO: "Faturamento (faturamento.xlsx)",
  CLASSIFICACAO: "Classificação Comprando/Produzindo (sciozvs0.csv)",
};

export const DATASET_ACCEPTS: Record<Dataset, string> = {
  PEDIDO: ".xlsx",
  FOLLOWUP: ".xlsx",
  ESTOQUE: ".xlsx",
  FATURAMENTO: ".xlsx",
  CLASSIFICACAO: ".csv",
};

export type { PedidoRow } from "./pedido";
export type { FollowUpRow } from "./followup";
export type { EstoqueRow } from "./estoque";
export type { FaturamentoRow } from "./faturamento";
export type { ClassificacaoRow } from "./classificacao";
