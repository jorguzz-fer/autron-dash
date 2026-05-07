import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type Unidade = "AUTRON" | "ERGOMEC" | "GRUPO";
export type MetaCategoria = "ENTRADA_PEDIDO" | "RECEITA";

export interface MetaPoint {
  unidade: Unidade;
  categoria: MetaCategoria;
  ano: number;
  mes: number;
  valor: number;
}

function toNum(d: Prisma.Decimal | number): number {
  return Number(d);
}

export async function getMetas(tenantId: string, ano?: number): Promise<MetaPoint[]> {
  const rows = await prisma.meta.findMany({
    where: { tenantId, ...(ano ? { ano } : {}) },
    orderBy: [{ ano: "asc" }, { mes: "asc" }, { unidade: "asc" }],
  });
  return rows.map((r) => ({
    unidade: r.unidade as Unidade,
    categoria: r.categoria as MetaCategoria,
    ano: r.ano,
    mes: r.mes,
    valor: toNum(r.valor),
  }));
}

/** Soma do total anual de Entrada de Pedido por unidade. */
export async function getMetaAnualByUnidade(tenantId: string, ano: number) {
  const rows = await prisma.meta.findMany({
    where: { tenantId, ano, categoria: "ENTRADA_PEDIDO" },
    select: { unidade: true, valor: true },
  });
  const map = new Map<Unidade, number>();
  for (const r of rows) {
    const u = r.unidade as Unidade;
    map.set(u, (map.get(u) ?? 0) + Number(r.valor));
  }
  return map;
}
