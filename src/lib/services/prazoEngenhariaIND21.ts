import { prisma } from "@/lib/db";

export interface PrazoEngHistEntry {
  id: string;
  dataPrazo: Date;
  observacao: string | null;
  criadoEm: Date;
  criadoPorId: string;
  criadoPorNome: string | null;
}

export interface PrazoEngPedido {
  numPedido: string;
  prazoAtual: Date | null;
  ultimaAtualizacao: Date | null;
  qtdRegistros: number;
  historico: PrazoEngHistEntry[];
}

/**
 * Carrega todos os registros de PrazoEngenhariaIND21 do tenant e agrupa
 * por numPedido — devolvendo um Map onde:
 *  - prazoAtual    = dataPrazo do registro mais recente (criadoEm DESC)
 *  - historico     = lista completa, mais recente primeiro
 *  - qtdRegistros  = quantos registros existem
 *
 * Sempre filtra por tenantId — isolamento multi-tenant garantido aqui.
 */
export async function getPrazosEngByTenant(
  tenantId: string,
): Promise<Map<string, PrazoEngPedido>> {
  const rows = await prisma.prazoEngenhariaIND21.findMany({
    where: { tenantId },
    include: { user: { select: { id: true, name: true } } },
    orderBy: [{ numPedido: "asc" }, { criadoEm: "desc" }],
  });

  const map = new Map<string, PrazoEngPedido>();
  for (const r of rows) {
    const entry: PrazoEngHistEntry = {
      id: r.id,
      dataPrazo: r.dataPrazo,
      observacao: r.observacao,
      criadoEm: r.criadoEm,
      criadoPorId: r.criadoPor,
      criadoPorNome: r.user?.name ?? null,
    };
    const existing = map.get(r.numPedido);
    if (!existing) {
      map.set(r.numPedido, {
        numPedido: r.numPedido,
        prazoAtual: r.dataPrazo,
        ultimaAtualizacao: r.criadoEm,
        qtdRegistros: 1,
        historico: [entry],
      });
    } else {
      existing.historico.push(entry);
      existing.qtdRegistros++;
    }
  }
  return map;
}

/**
 * Cria um novo registro de prazo de engenharia. Sempre INSERT, nunca UPDATE —
 * a história inteira é preservada. Caller deve validar role + audit log.
 */
export async function criarPrazoEng(args: {
  tenantId: string;
  numPedido: string;
  dataPrazo: Date;
  observacao: string | null;
  criadoPor: string;
}) {
  return prisma.prazoEngenhariaIND21.create({
    data: {
      tenantId: args.tenantId,
      numPedido: args.numPedido,
      dataPrazo: args.dataPrazo,
      observacao: args.observacao,
      criadoPor: args.criadoPor,
    },
    select: { id: true, dataPrazo: true, criadoEm: true },
  });
}
