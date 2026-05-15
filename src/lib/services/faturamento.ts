import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface FaturamentoFilters {
  tenantId: string;
  dataInicio?: Date;
  dataFim?: Date;
}

export interface FaturamentoRow {
  id: string;
  emissao: Date | null;
  numDocto: string;
  produto: string;
  descricaoProduto: string | null;
  quantidade: number;
  noPedido: string | null;
  faturamentoBruto: number | null;
  faturamentoLiquido: number | null;
  margemLiquidaR: number | null;
  margemLiquidaPct: number | null;
  nomeVendedor: string | null;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  uf: string | null;
  tipoNegocio: string | null;
}

function toNum(d: Prisma.Decimal | null | undefined): number | null {
  return d == null ? null : Number(d);
}

/**
 * Limites de data de Emissão NF do tenant (min/max).
 * Usado para pré-carregar o filtro De/Até da aba Faturamento com o
 * range completo das notas — paridade Streamlit (filtro vem preenchido).
 */
export async function getFaturamentoDateBounds(
  tenantId: string,
): Promise<{ min: Date | null; max: Date | null }> {
  const agg = await prisma.faturamento.aggregate({
    where: { tenantId, emissao: { not: null } },
    _min: { emissao: true },
    _max: { emissao: true },
  });
  return { min: agg._min.emissao ?? null, max: agg._max.emissao ?? null };
}

export async function getFaturamentos(f: FaturamentoFilters): Promise<FaturamentoRow[]> {
  const where: Prisma.FaturamentoWhereInput = { tenantId: f.tenantId };
  if (f.dataInicio || f.dataFim) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (f.dataInicio) range.gte = f.dataInicio;
    if (f.dataFim) range.lte = f.dataFim;
    where.emissao = range;
  }
  const rows = await prisma.faturamento.findMany({
    where,
    orderBy: { emissao: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    emissao: r.emissao,
    numDocto: r.numDocto,
    produto: r.produto,
    descricaoProduto: r.descricaoProduto,
    quantidade: r.quantidade,
    noPedido: r.noPedido,
    faturamentoBruto: toNum(r.faturamentoBruto),
    faturamentoLiquido: toNum(r.faturamentoLiquido),
    margemLiquidaR: toNum(r.margemLiquidaR),
    margemLiquidaPct: toNum(r.margemLiquidaPct),
    nomeVendedor: r.nomeVendedor,
    razaoSocial: r.razaoSocial,
    nomeFantasia: r.nomeFantasia,
    uf: r.uf,
    tipoNegocio: r.tipoNegocio,
  }));
}
