import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import type { Role } from "@/lib/authz";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const SELECT_USER_ROW = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  mfaEnabled: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/**
 * Lista usuários do tenant. Sempre filtra por tenantId (isolamento).
 * Ordem: ativos primeiro, depois alfabético por nome.
 */
export async function listUsersByTenant(tenantId: string): Promise<UserRow[]> {
  const rows = await prisma.user.findMany({
    where: { tenantId },
    select: SELECT_USER_ROW,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role as Role,
    active: r.active,
    mfaEnabled: r.mfaEnabled,
    lastLoginAt: r.lastLoginAt,
    createdAt: r.createdAt,
  }));
}

export async function findUserInTenant(tenantId: string, id: string) {
  return prisma.user.findFirst({
    where: { id, tenantId },
    select: { ...SELECT_USER_ROW, tenantId: true },
  });
}

export async function findUserByEmailInTenant(tenantId: string, email: string) {
  return prisma.user.findUnique({
    where: { tenantId_email: { tenantId, email: email.toLowerCase() } },
    select: { id: true },
  });
}

export async function createUserInTenant(args: {
  tenantId: string;
  name: string;
  email: string;
  role: Role;
  passwordHash: string;
}): Promise<UserRow> {
  const r = await prisma.user.create({
    data: {
      tenantId: args.tenantId,
      name: args.name,
      email: args.email.toLowerCase(),
      role: args.role,
      passwordHash: args.passwordHash,
      active: true,
      mustChangePassword: true, // força troca na primeira entrada
    },
    select: SELECT_USER_ROW,
  });
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role as Role,
    active: r.active,
    mfaEnabled: r.mfaEnabled,
    lastLoginAt: r.lastLoginAt,
    createdAt: r.createdAt,
  };
}

/**
 * Update atômico filtrando por (id, tenantId). Retorna `count` (0 = não
 * encontrado ou pertence a outro tenant).
 */
export async function updateUserInTenant(
  tenantId: string,
  id: string,
  data: { name?: string; email?: string; role?: Role; active?: boolean },
): Promise<number> {
  const result = await prisma.user.updateMany({
    where: { id, tenantId },
    data: {
      ...data,
      ...(data.email ? { email: data.email.toLowerCase() } : {}),
    },
  });
  return result.count;
}

/**
 * Atualiza hash de senha de um usuário do tenant.
 * @param mustChangePassword true = reset pelo admin (força troca no próximo login);
 *                           false = troca feita pelo próprio usuário.
 */
export async function setPasswordHashInTenant(
  tenantId: string,
  id: string,
  passwordHash: string,
  mustChangePassword = true,
): Promise<number> {
  const result = await prisma.user.updateMany({
    where: { id, tenantId },
    data: { passwordHash, mustChangePassword },
  });
  return result.count;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
