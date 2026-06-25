import { prisma } from "@/lib/db";
import type { Role } from "@/lib/authz";
import {
  type Capability,
  getDefaultCapabilities,
  isCapability,
} from "@/lib/capabilities";
import {
  type ModuleKey,
  getDefaultModules,
  MODULES,
} from "@/lib/pageAccess";

const VALID_MODULES = new Set<string>(MODULES.map((m) => m.key));

// E-mail legado com acesso ao KPI Financeiro (ver lib/kpiAccess). Mantido como
// rede de segurança durante a migração para capacidades — assim ninguém perde
// acesso no deploy mesmo que o role não seja CONTROLADORIA.
const KPI_LEGACY_EMAIL = "controladoria@autron.com.br";

export interface PerfilRow {
  id: string;
  nome: string;
  label: string;
  descricao: string | null;
  isSystem: boolean;
  baseRole: Role;
  modules: string[];
  capabilities: string[];
  ativo: boolean;
  userCount: number;
}

export interface UserAccess {
  role: string;
  perfilId: string | null;
  perfilLabel: string | null;
  modules: ModuleKey[];
  capabilities: Capability[];
}

/**
 * Resolve os módulos e capacidades EFETIVOS de um usuário, na ordem:
 *  - capacidades: perfil → padrão do role
 *  - módulos: override por usuário (allowedModules) → perfil → padrão do role
 */
export async function getUserAccess(tenantId: string, userId: string): Promise<UserAccess> {
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId },
    select: {
      role: true,
      email: true,
      allowedModules: true,
      perfilId: true,
      perfil: {
        select: { id: true, label: true, modules: true, capabilities: true, ativo: true },
      },
    },
  });

  if (!user) {
    return { role: "VIEWER", perfilId: null, perfilLabel: null, modules: [], capabilities: [] };
  }

  const perfil = user.perfil?.ativo ? user.perfil : null;

  // Capacidades
  const caps = new Set<Capability>(
    perfil
      ? perfil.capabilities.filter(isCapability)
      : getDefaultCapabilities(user.role),
  );
  // Rede de segurança do e-mail legado do KPI.
  if ((user.email ?? "").trim().toLowerCase() === KPI_LEGACY_EMAIL) {
    caps.add("ACCESS_KPI_FINANCEIRO");
  }

  // Módulos
  let modules: ModuleKey[];
  if (user.allowedModules.length > 0) {
    modules = user.allowedModules.filter((m) => VALID_MODULES.has(m)) as ModuleKey[];
  } else if (perfil) {
    modules = perfil.modules.filter((m) => VALID_MODULES.has(m)) as ModuleKey[];
  } else {
    modules = getDefaultModules(user.role);
  }

  return {
    role: user.role,
    perfilId: user.perfilId,
    perfilLabel: perfil?.label ?? null,
    modules,
    capabilities: [...caps],
  };
}

/** Apenas as capacidades efetivas (atalho para guards). */
export async function getUserCapabilities(
  tenantId: string,
  userId: string,
): Promise<Capability[]> {
  const access = await getUserAccess(tenantId, userId);
  return access.capabilities;
}

export async function listPerfisByTenant(tenantId: string): Promise<PerfilRow[]> {
  const rows = await prisma.perfil.findMany({
    where: { tenantId },
    orderBy: [{ isSystem: "desc" }, { label: "asc" }],
    select: {
      id: true,
      nome: true,
      label: true,
      descricao: true,
      isSystem: true,
      baseRole: true,
      modules: true,
      capabilities: true,
      ativo: true,
      _count: { select: { users: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    label: r.label,
    descricao: r.descricao,
    isSystem: r.isSystem,
    baseRole: r.baseRole as Role,
    modules: r.modules,
    capabilities: r.capabilities,
    ativo: r.ativo,
    userCount: r._count.users,
  }));
}

export async function findPerfilInTenant(tenantId: string, id: string) {
  return prisma.perfil.findFirst({ where: { id, tenantId } });
}

/** Perfis ativos para popular dropdowns (atribuição de usuário). */
export async function listPerfisAtivos(tenantId: string) {
  return prisma.perfil.findMany({
    where: { tenantId, ativo: true },
    orderBy: [{ isSystem: "desc" }, { label: "asc" }],
    select: { id: true, label: true, baseRole: true, isSystem: true },
  });
}

export interface PerfilInput {
  label: string;
  descricao?: string | null;
  baseRole: Role;
  modules: string[];
  capabilities: string[];
}

function sanitize(input: PerfilInput) {
  return {
    label: input.label.trim(),
    descricao: input.descricao?.trim() || null,
    baseRole: input.baseRole,
    modules: [...new Set(input.modules.filter((m) => VALID_MODULES.has(m)))],
    capabilities: [...new Set(input.capabilities.filter(isCapability))],
  };
}

/** Gera uma chave única (nome) a partir do label. */
function slugify(label: string): string {
  return (
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // remove acentos
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "PERFIL"
  );
}

export async function createPerfil(tenantId: string, input: PerfilInput) {
  const data = sanitize(input);
  // nome único por tenant — adiciona sufixo se colidir.
  const base = slugify(data.label);
  let nome = base;
  let i = 1;
  while (await prisma.perfil.findUnique({ where: { tenantId_nome: { tenantId, nome } } })) {
    nome = `${base}_${i++}`;
  }
  return prisma.perfil.create({
    data: { tenantId, nome, isSystem: false, ativo: true, ...data },
  });
}

export async function updatePerfil(tenantId: string, id: string, input: PerfilInput) {
  const data = sanitize(input);
  const result = await prisma.perfil.updateMany({
    where: { id, tenantId },
    data,
  });
  return result.count;
}

export async function deletePerfil(tenantId: string, id: string) {
  return prisma.perfil.deleteMany({ where: { id, tenantId, isSystem: false } });
}
