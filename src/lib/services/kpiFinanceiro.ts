import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnrichedPedidos } from "./dashboard";
import {
  groupAFaturar,
  groupAReceber,
  isProtesto,
  type AFaturarBase,
  type ClienteAFaturar,
  type ClienteAReceber,
  type PedidoAFaturarItem,
  type TituloReceberItem,
} from "@/lib/domain/kpiFinanceiro";

function num(d: Prisma.Decimal | null | undefined): number {
  return d == null ? 0 : Number(d);
}

export interface AReceberResult {
  clientes: ClienteAReceber[];
  /** Data de referência do relatório (Dt.Ref do FINR130). */
  dataReferencia: Date | null;
  qtdTitulos: number;
  hasData: boolean;
}

/**
 * A RECEBER — posição de títulos (vencidos + a vencer) agrupada por cliente.
 * Fonte: dataset TITULO_RECEBER (relatório FINR130). Snapshot atual por tenant.
 */
export async function getAReceber(
  tenantId: string,
  hoje: Date = new Date(),
): Promise<AReceberResult> {
  const titulos = await prisma.tituloReceber.findMany({ where: { tenantId } });

  const items: TituloReceberItem[] = titulos.map((t) => ({
    codigoCliente: t.codigoCliente,
    loja: t.loja,
    nomeCliente: t.nomeCliente,
    saldoVencido: num(t.saldoVencido),
    saldoAVencer: num(t.saldoAVencer),
    diasAtraso: t.diasAtraso,
    vencimento: t.vencimento,
    emCartorio: isProtesto(t.historico),
  }));

  const clientes = groupAReceber(items, hoje);
  const dataReferencia =
    titulos.find((t) => t.dataReferencia != null)?.dataReferencia ?? null;

  return {
    clientes,
    dataReferencia,
    qtdTitulos: titulos.length,
    hasData: titulos.length > 0,
  };
}

/**
 * A FATURAR — carteira de pedidos EM ABERTO (sem NF) agrupada por cliente, com
 * aging configurável (emissão do pedido × entrega prevista).
 * Fonte: Pedidos (entrada_pedido) já carregados no Dash.
 */
export async function getAFaturar(
  tenantId: string,
  base: AFaturarBase,
  hoje: Date = new Date(),
): Promise<ClienteAFaturar[]> {
  const enriched = await getEnrichedPedidos({ tenantId });
  const emAberto = enriched.filter((p) => p.statusPedido === "EM ABERTO");

  const items: PedidoAFaturarItem[] = emAberto.map((p) => ({
    numPedido: p.numPedido,
    cliente: p.clienteNome ?? p.cliente ?? "—",
    vlrTotal: p.vlrTotal ?? 0,
    dtEmissao: p.dtEmissao,
    dtEntrega: p.dtEntrega,
  }));

  return groupAFaturar(items, base, hoje);
}
