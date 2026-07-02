import { Prisma } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { dataTag } from "@/lib/cache";
import { getEnrichedPedidos } from "@/lib/services/dashboard";

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

/**
 * Faturamento líquido somado por mês "YYYY-MM", agregado NO BANCO.
 * Substitui o findMany completo + loop JS que a página fazia (37MB de
 * dados por request). Paridade com monthKey(): to_char lê o timestamp
 * naive como gravado — igual a getFullYear/getMonth com TZ=UTC (prod).
 *
 * CACHE: dado só muda no upload de FATURAMENTO. O cache guarda as entradas
 * [mês, valor] (JSON-safe); o Map é reconstruído fora da fronteira do cache
 * (Map não sobrevive à serialização do unstable_cache).
 */
export async function getFaturamentoLiquidoByMes(tenantId: string): Promise<Map<string, number>> {
  const entries = await unstable_cache(
    async (tid: string): Promise<[string, number][]> => {
      const rows = await prisma.$queryRaw<{ mes: string; total: number }[]>`
        SELECT to_char("emissao", 'YYYY-MM') AS mes,
               COALESCE(SUM("faturamentoLiquido"), 0)::float8 AS total
        FROM "Faturamento"
        WHERE "tenantId" = ${tid} AND "emissao" IS NOT NULL
        GROUP BY 1
      `;
      return rows.map((r) => [r.mes, r.total]);
    },
    ["fat-liq-by-mes"],
    { tags: [dataTag(tenantId, "FATURAMENTO")] },
  )(tenantId);
  return new Map(entries);
}

// ── Carteira (para os cards de Faturamento) ────────────────────────

export interface CarteiraFaturamento {
  /** Bruto da carteira EM ABERTO por mês "YYYY-MM" (chave = dtEntrega). */
  byMes: Record<string, number>;
  brutoTotal: number;
  linhas: number;
  /** PVs (numPedido) distintos. */
  pvs: number;
}

/**
 * Rollup da carteira EM ABERTO consumido pelos cards de Faturamento.
 *
 * Faz o enrich pesado (getEnrichedPedidos: 5 findMany + join em JS) apenas
 * no cache miss e devolve só o resumo — JSON-safe, sem Date cruzando a
 * fronteira do cache. Substitui o getEnrichedPedidos direto na página.
 *
 * Regras (paridade Streamlit app.py:2095-2100), idênticas ao que a página
 * calculava antes:
 *   - statusPedido === "EM ABERTO" (INCLUI cancelados)
 *   - agrupa por dtEntrega; pedidos sem dtEntrega saem do byMes mas contam
 *     nos totais (brutoTotal/linhas/pvs)
 *
 * CACHE: depende de todos os datasets que o enrich lê → invalidado quando
 * qualquer um deles é re-enviado.
 */
export async function getCarteiraFaturamento(tenantId: string): Promise<CarteiraFaturamento> {
  return unstable_cache(
    async (tid: string): Promise<CarteiraFaturamento> => {
      const enriched = await getEnrichedPedidos({ tenantId: tid });
      const emAberto = enriched.filter((p) => p.statusPedido === "EM ABERTO");
      const byMes: Record<string, number> = {};
      for (const p of emAberto) {
        if (!p.dtEntrega) continue;
        const k = `${p.dtEntrega.getFullYear()}-${String(p.dtEntrega.getMonth() + 1).padStart(2, "0")}`;
        byMes[k] = (byMes[k] ?? 0) + (p.vlrTotal ?? 0);
      }
      const brutoTotal = emAberto.reduce((a, p) => a + (p.vlrTotal ?? 0), 0);
      const pvs = new Set(emAberto.map((p) => p.numPedido)).size;
      return { byMes, brutoTotal, linhas: emAberto.length, pvs };
    },
    ["carteira-faturamento"],
    {
      tags: [
        dataTag(tenantId, "PEDIDO"),
        dataTag(tenantId, "FOLLOWUP"),
        dataTag(tenantId, "ESTOQUE"),
        dataTag(tenantId, "CLASSIFICACAO"),
        dataTag(tenantId, "PLOOMES"),
      ],
    },
  )(tenantId);
}

export interface FaturamentoResumo {
  totalBruto: number;
  totalLiquido: number;
  /** Média simples de margemLiquidaPct das linhas com margem (paridade com o cálculo JS). */
  margemMediaPct: number;
  /** COUNT(DISTINCT numDocto) — NFs únicas. */
  nfsUnicas: number;
  /** Total de linhas do período (usado pela paginação do Detalhe). */
  linhas: number;
}

/** KPIs do Detalhamento agregados no banco — antes exigiam todas as linhas em memória. */
export async function getFaturamentoResumo(f: FaturamentoFilters): Promise<FaturamentoResumo> {
  const [row] = await prisma.$queryRaw<
    { bruto: number; liquido: number; margem: number | null; nfs: number; linhas: number }[]
  >`
    SELECT COALESCE(SUM("faturamentoBruto"), 0)::float8   AS bruto,
           COALESCE(SUM("faturamentoLiquido"), 0)::float8 AS liquido,
           AVG("margemLiquidaPct")::float8                AS margem,
           COUNT(DISTINCT "numDocto")::int                AS nfs,
           COUNT(*)::int                                  AS linhas
    FROM "Faturamento"
    WHERE "tenantId" = ${f.tenantId}
      AND (${f.dataInicio ?? null}::timestamp IS NULL OR "emissao" >= ${f.dataInicio ?? null})
      AND (${f.dataFim ?? null}::timestamp IS NULL OR "emissao" <= ${f.dataFim ?? null})
  `;
  return {
    totalBruto: row?.bruto ?? 0,
    totalLiquido: row?.liquido ?? 0,
    margemMediaPct: row?.margem ?? 0,
    nfsUnicas: row?.nfs ?? 0,
    linhas: row?.linhas ?? 0,
  };
}

// ── Detalhe paginado (sort + skip/take no banco) ───────────────────

/** Colunas ordenáveis da tabela Detalhe; true = nullable (usa nulls:last como o sortRows fazia). */
const SORTABLE_FIELDS: Record<string, boolean> = {
  emissao: true,
  numDocto: false,
  noPedido: true,
  produto: false,
  quantidade: false,
  razaoSocial: true,
  nomeFantasia: true,
  uf: true,
  faturamentoBruto: true,
  faturamentoLiquido: true,
  margemLiquidaR: true,
  margemLiquidaPct: true,
  nomeVendedor: true,
  tipoNegocio: true,
};

export interface FaturamentoPageParams extends FaturamentoFilters {
  sortKey?: string;
  sortDir?: "asc" | "desc";
  page: number;
  pageSize: number;
}

/** Página do Detalhe das Notas — ORDER BY + LIMIT/OFFSET no banco (nunca a tabela inteira). */
export async function getFaturamentosPage(p: FaturamentoPageParams): Promise<FaturamentoRow[]> {
  const where = buildWhere(p);

  const dir = p.sortDir ?? "desc";
  const key = p.sortKey && p.sortKey in SORTABLE_FIELDS ? p.sortKey : "emissao";
  const primary = SORTABLE_FIELDS[key]
    ? { [key]: { sort: dir, nulls: "last" } }
    : { [key]: dir };

  const rows = await prisma.faturamento.findMany({
    where,
    // id como desempate → paginação estável mesmo com emissões repetidas
    orderBy: [primary as Prisma.FaturamentoOrderByWithRelationInput, { id: "asc" }],
    skip: (p.page - 1) * p.pageSize,
    take: p.pageSize,
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

export type TopFaturamentoFilters = FaturamentoFilters & {
  dim: TopFaturamentoDim;
  limit?: number;
};

/**
 * Ranking TOP N por faturamento líquido, agregado NO BANCO (groupBy + _sum),
 * sem carregar linhas em memória. Importante para "nota": a mesma NF aparece
 * em várias linhas (filiais/lotes/remessas) — o groupBy por numDocto soma tudo.
 *
 * CACHE: retorno é JSON-safe ({label, value, pct}). Cacheado por combinação
 * de (tenant, dim, período, limit) — trocar Clientes/Notas/Produtos/Vendedores
 * ou o período do card passa a servir do cache, sem bater no banco (some a
 * principal fonte de 503 durante picos de I/O do Postgres). Invalida no
 * upload de FATURAMENTO.
 */
export async function getTopFaturamentos(
  f: TopFaturamentoFilters,
): Promise<TopFaturamentoItem[]> {
  return unstable_cache(computeTopFaturamentos, ["top-faturamentos"], {
    tags: [dataTag(f.tenantId, "FATURAMENTO")],
  })(f);
}

async function computeTopFaturamentos(
  f: TopFaturamentoFilters,
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
