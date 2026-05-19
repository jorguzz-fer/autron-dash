import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface AuditLogRow {
  id: string;
  createdAt: Date;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  ip: string | null;
}

export interface AuditLogQuery {
  tenantId: string;
  userId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export interface AuditLogPage {
  rows: AuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;

/**
 * Lista logs de auditoria do tenant (SEMPRE filtra por tenantId — isolamento).
 * Ordena por mais recente primeiro. Pagina via skip/take.
 */
export async function listAuditLogs(q: AuditLogQuery): Promise<AuditLogPage> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(10, q.pageSize ?? DEFAULT_PAGE_SIZE));

  const where: Prisma.AuditLogWhereInput = { tenantId: q.tenantId };
  if (q.userId) where.userId = q.userId;
  if (q.action) where.action = q.action;
  if (q.from || q.to) {
    const range: Prisma.DateTimeFilter = {};
    if (q.from) range.gte = q.from;
    if (q.to) range.lte = q.to;
    where.createdAt = range;
  }

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  return {
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      userId: r.userId,
      userName: r.user?.name ?? null,
      userEmail: r.user?.email ?? null,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      ip: r.ip,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Tipos de ação distintos já registrados (para o dropdown de filtro). */
export async function listAuditActions(tenantId: string): Promise<string[]> {
  const rows = await prisma.auditLog.findMany({
    where: { tenantId },
    select: { action: true },
    distinct: ["action"],
    orderBy: { action: "asc" },
  });
  return rows.map((r) => r.action);
}
