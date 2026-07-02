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

function buildWhere(f: FaturamentoFilters): Prisma.FaturamentoWhereInput {
  const where: Prisma.FaturamentoWhereInput = { tenantId: f.tenantId };
  if (f.dataInicio || f.dataFim) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (f.dataInicio) range.gte = f.dataInicio;
    if (f.dataFim) range.lte = f.dataFim;
    where.emissao = range;
  }
  return where;
}

export async function getFaturamentos(f: FaturamentoFilters): Promise<FaturamentoRow[]> {
  const where = buildWhere(f);
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

// ── TOP N Faturamentos (ranking por dimensão) ──────────────────────

export const TOP_FATURAMENTO_DIMS = ["cliente", "nota", "produto", "vendedor"] as const;
export type TopFaturamentoDim = (typeof TOP_FATURAMENTO_DIMS)[number];

export interface TopFaturamentoItem {
  label: string;
  /** Faturamento líquido somado da dimensão no período. */
  value: number;
  /** Participação % sobre o total líquido do período. */
  pct: number;
}

/**
 * Ranking TOP N por faturamento líquido, agregado NO BANCO (groupBy + _sum),
 * sem carregar linhas em memória. Importante para "nota": a mesma NF aparece
 * em várias linhas (filiais/lotes/remessas) — o groupBy por numDocto soma tudo.
 */
export async function getTopFaturamentos(
  f: FaturamentoFilters & { dim: TopFaturamentoDim; limit?: number },
): Promise<TopFaturamentoItem[]> {
  const where = buildWhere(f);
  const take = f.limit ?? 20;
  const orderBy = { _sum: { faturamentoLiquido: "desc" } } as const;
  const _sum = { faturamentoLiquido: true } as const;

  // groupBy tipado por dimensão + total do período para calcular participação %
  const [groups, totalAgg] = await Promise.all([
    (async (): Promise<{ key: string | null; sum: number }[]> => {
      switch (f.dim) {
        case "cliente": {
          const rows = await prisma.faturamento.groupBy({
            by: ["razaoSocial"], where, _sum, orderBy, take,
          });
          return rows.map((r) => ({ key: r.razaoSocial, sum: toNum(r._sum.faturamentoLiquido) ?? 0 }));
        }
        case "nota": {
          const rows = await prisma.faturamento.groupBy({
            by: ["numDocto"], where, _sum, orderBy, take,
          });
          return rows.map((r) => ({ key: r.numDocto, sum: toNum(r._sum.faturamentoLiquido) ?? 0 }));
        }
        case "produto": {
          const rows = await prisma.faturamento.groupBy({
            by: ["produto"], where, _sum, orderBy, take,
          });
          return rows.map((r) => ({ key: r.produto, sum: toNum(r._sum.faturamentoLiquido) ?? 0 }));
        }
        case "vendedor": {
          const rows = await prisma.faturamento.groupBy({
            by: ["nomeVendedor"], where, _sum, orderBy, take,
          });
          return rows.map((r) => ({ key: r.nomeVendedor, sum: toNum(r._sum.faturamentoLiquido) ?? 0 }));
        }
      }
    })(),
    prisma.faturamento.aggregate({ where, _sum }),
  ]);

  const total = toNum(totalAgg._sum.faturamentoLiquido) ?? 0;

  // Enriquecimento de rótulo (só para as ≤20 chaves do ranking):
  //   nota    → junta a razão social do cliente da NF
  //   produto → junta a descrição do produto
  const labelByKey = new Map<string, string>();
  const keys = groups.map((g) => g.key).filter((k): k is string => k != null);
  if (f.dim === "nota" && keys.length > 0) {
    const docs = await prisma.faturamento.findMany({
      where: { tenantId: f.tenantId, numDocto: { in: keys } },
      select: { numDocto: true, razaoSocial: true },
      distinct: ["numDocto"],
    });
    for (const d of docs) {
      labelByKey.set(d.numDocto, d.razaoSocial ? `NF ${d.numDocto} · ${d.razaoSocial}` : `NF ${d.numDocto}`);
    }
  } else if (f.dim === "produto" && keys.length > 0) {
    const prods = await prisma.faturamento.findMany({
      where: { tenantId: f.tenantId, produto: { in: keys } },
      select: { produto: true, descricaoProduto: true },
      distinct: ["produto"],
    });
    for (const p of prods) {
      labelByKey.set(p.produto, p.descricaoProduto ? `${p.produto} · ${p.descricaoProduto}` : p.produto);
    }
  }

  return groups.map((g) => ({
    label: g.key == null ? "—" : (labelByKey.get(g.key) ?? g.key),
    value: g.sum,
    pct: total > 0 ? (g.sum / total) * 100 : 0,
  }));
}
