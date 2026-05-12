import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ClassificacaoInput,
  EstoqueInput,
  FollowUpInput,
  PedidoEnriched,
  PedidoInput,
  TipoProduto,
  enrichPedidos,
} from "@/lib/domain";

export interface DashboardFilters {
  tenantId: string;
  /** Inclui apenas pedidos com dtEmissao >= dataInicio (se informado). */
  dataInicio?: Date;
  /** Inclui apenas pedidos com dtEmissao <= dataFim (se informado). */
  dataFim?: Date;
}

function toNum(d: Prisma.Decimal | null | undefined): number | null {
  return d == null ? null : Number(d);
}

function asTipoProduto(s: string): TipoProduto {
  return s === "Comprando" || s === "Produzindo" ? s : "Indefinido";
}

/**
 * Fonte única de verdade da camada de dashboard:
 *  - Faz fetch dos 4 datasets relevantes (pedidos, followups, estoques, classificações)
 *  - Converte tipos do Prisma (Decimal) para tipos domésticos (number)
 *  - Aplica enrichPedidos() do domínio
 *
 * Sempre filtra por tenantId — isolamento multi-tenant garantido aqui.
 *
 * Nota: o filtro de data é aplicado APENAS em pedidos. Follow-up, estoque e
 * classificação vêm completos por tenant (são sempre snapshots atuais —
 * estoque atual, classificação atual, etc.).
 */
export async function getEnrichedPedidos(filters: DashboardFilters): Promise<PedidoEnriched[]> {
  const wherePedido: Prisma.PedidoWhereInput = { tenantId: filters.tenantId };
  if (filters.dataInicio || filters.dataFim) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (filters.dataInicio) range.gte = filters.dataInicio;
    if (filters.dataFim) range.lte = filters.dataFim;
    wherePedido.dtEmissao = range;
  }

  const [pedidos, followUps, estoques, classificacoes, ploomesRows] = await Promise.all([
    prisma.pedido.findMany({ where: wherePedido }),
    prisma.followUp.findMany({ where: { tenantId: filters.tenantId } }),
    prisma.estoque.findMany({ where: { tenantId: filters.tenantId } }),
    prisma.classificacaoProduto.findMany({ where: { tenantId: filters.tenantId } }),
    // Apenas codigoCliente + cliente — pra construir o lookup nome ← código.
    prisma.ploomesOportunidade.findMany({
      where: { tenantId: filters.tenantId, codigoCliente: { not: null } },
      select: { codigoCliente: true, cliente: true },
    }),
  ]);

  // Map<codigoCliente, nomeCliente> — primeira ocorrência ganha (idempotente
  // se o mesmo cliente aparece em múltiplas oportunidades).
  const nomeByCodCliente = new Map<string, string>();
  for (const r of ploomesRows) {
    if (r.codigoCliente && r.cliente && !nomeByCodCliente.has(r.codigoCliente)) {
      nomeByCodCliente.set(r.codigoCliente, r.cliente);
    }
  }

  const pedidosInput: PedidoInput[] = pedidos.map((p) => ({
    id: p.id,
    numPedido: p.numPedido,
    item: p.item,
    produto: p.produto,
    descricaoProduto: p.descricaoProduto,
    quantidade: p.quantidade,
    vlrTotal: toNum(p.vlrTotal),
    margemPct: toNum(p.margemPct),
    dtEmissao: p.dtEmissao,
    dtOfertada: p.dtOfertada,
    dtFatCli: p.dtFatCli,
    notaFiscal: p.notaFiscal,
    numeroSC: p.numeroSC,
    itemSC: p.itemSC,
    numeroOP: p.numeroOP,
    itemOP: p.itemOP,
    pedCliente: p.pedCliente,
    nomeVendedor: p.nomeVendedor,
    unidadeNegocio: p.unidadeNegocio,
    contrato: p.contrato,
    cliente: p.cliente,
  }));

  const followUpsInput: FollowUpInput[] = followUps.map((f) => ({
    noSC: f.noSC,
    numeroPV: f.numeroPV,
    codigoItem: f.codigoItem,
    pasta: f.pasta,
    dtConfirma: f.dtConfirma,
    dtPreEntr: f.dtPreEntr,
    dtChegadaAutron: f.dtChegadaAutron,
    noPO: f.noPO,
    opNaSC: f.opNaSC,
    pvInformadoSC: f.pvInformadoSC,
  }));

  const estoquesInput: EstoqueInput[] = estoques.map((e) => ({
    codigo: e.codigo,
    saldoEstoque: Number(e.saldoEstoque),
  }));

  const classificacoesInput: ClassificacaoInput[] = classificacoes.map((c) => ({
    produto: c.produto,
    tipoProduto: asTipoProduto(c.tipoProduto),
  }));

  const enriched = enrichPedidos({
    pedidos: pedidosInput,
    followUps: followUpsInput,
    estoques: estoquesInput,
    classificacoes: classificacoesInput,
  });

  // Pós-enriquecimento: resolve nome do cliente via Ploomes lookup.
  // O Pedido.cliente do Excel costuma ser o código (ex: "C009280"); aqui
  // mapeamos pro nome legível quando o cliente está no CRM.
  return enriched.map((p) => ({
    ...p,
    clienteNome: p.cliente ? nomeByCodCliente.get(p.cliente) ?? null : null,
  }));
}
