import { prisma } from "@/lib/db";

export interface ObservacaoPVData {
  numPedido: string;
  texto: string;
  atualizadoEm: Date;
  atualizadoPorNome: string | null;
}

/**
 * Carrega todas as observações de PV do tenant e devolve um Map indexado por
 * numPedido. Um registro por (tenantId, numPedido) — sem histórico.
 *
 * Sempre filtra por tenantId — isolamento multi-tenant garantido aqui.
 */
export async function getObservacoesByTenant(
  tenantId: string,
): Promise<Map<string, ObservacaoPVData>> {
  const rows = await prisma.observacaoPV.findMany({
    where: { tenantId },
    include: { user: { select: { name: true } } },
  });

  const map = new Map<string, ObservacaoPVData>();
  for (const r of rows) {
    map.set(r.numPedido, {
      numPedido: r.numPedido,
      texto: r.texto,
      atualizadoEm: r.atualizadoEm,
      atualizadoPorNome: r.user?.name ?? null,
    });
  }
  return map;
}

/**
 * Cria ou atualiza (upsert) a observação de um PV. Texto vazio remove o
 * registro. Caller deve validar sessão + cross-tenant + audit log.
 */
export async function upsertObservacaoPV(args: {
  tenantId: string;
  numPedido: string;
  texto: string;
  atualizadoPor: string;
}) {
  return prisma.observacaoPV.upsert({
    where: { tenantId_numPedido: { tenantId: args.tenantId, numPedido: args.numPedido } },
    create: {
      tenantId: args.tenantId,
      numPedido: args.numPedido,
      texto: args.texto,
      atualizadoPor: args.atualizadoPor,
    },
    update: {
      texto: args.texto,
      atualizadoPor: args.atualizadoPor,
    },
    select: { id: true, atualizadoEm: true },
  });
}

/**
 * Remove a observação de um PV (quando o texto é apagado). No-op se não existir.
 */
export async function deleteObservacaoPV(args: { tenantId: string; numPedido: string }) {
  await prisma.observacaoPV.deleteMany({
    where: { tenantId: args.tenantId, numPedido: args.numPedido },
  });
}
