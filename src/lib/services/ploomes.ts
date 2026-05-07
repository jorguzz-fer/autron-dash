import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface PloomesOportunidade {
  id: string;
  ploomesId: string;
  titulo: string;
  cliente: string | null;
  responsavel: string | null;
  valor: number | null;
  termino: Date | null;
  criacao: Date | null;
  ufCliente: string | null;
  cidadeCliente: string | null;
  pedidoCompraCliente: string | null;
}

function toNum(d: Prisma.Decimal | null | undefined): number | null {
  return d == null ? null : Number(d);
}

export interface PloomesFilters {
  tenantId: string;
  /** Filtra por mês mínimo de "Término" (data ganhou). */
  desde?: Date;
  ate?: Date;
}

export async function getPloomes(f: PloomesFilters): Promise<PloomesOportunidade[]> {
  const where: Prisma.PloomesOportunidadeWhereInput = { tenantId: f.tenantId };
  if (f.desde || f.ate) {
    const range: Prisma.DateTimeNullableFilter = {};
    if (f.desde) range.gte = f.desde;
    if (f.ate) range.lte = f.ate;
    where.termino = range;
  }
  const rows = await prisma.ploomesOportunidade.findMany({
    where,
    orderBy: { termino: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    ploomesId: r.ploomesId,
    titulo: r.titulo,
    cliente: r.cliente,
    responsavel: r.responsavel,
    valor: toNum(r.valor),
    termino: r.termino,
    criacao: r.criacao,
    ufCliente: r.ufCliente,
    cidadeCliente: r.cidadeCliente,
    pedidoCompraCliente: r.pedidoCompraCliente,
  }));
}
