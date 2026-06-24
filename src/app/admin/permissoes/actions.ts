"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireRole, ROLES_ADMIN } from "@/lib/authz";
import { findUserInTenant, setUserModuleAccess } from "@/lib/services/users";
import { MODULES, type ModuleKey } from "@/lib/pageAccess";
import { logAudit } from "@/lib/audit";

type SimpleResult = { ok: true } | { ok: false; error: string };

const VALID_KEYS = new Set<string>(MODULES.map((m) => m.key));

export async function salvarPermissoes(input: {
  userId: string;
  modules: string[];
}): Promise<SimpleResult> {
  const guard = await requireRole(ROLES_ADMIN);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const { userId, modules } = input;
  if (!userId) return { ok: false, error: "ID de usuário obrigatório" };

  const invalid = modules.filter((m) => !VALID_KEYS.has(m));
  if (invalid.length > 0) {
    return { ok: false, error: `Módulos inválidos: ${invalid.join(", ")}` };
  }

  const target = await findUserInTenant(session.user.tenantId, userId);
  if (!target) return { ok: false, error: "Usuário não encontrado" };

  const count = await setUserModuleAccess(session.user.tenantId, userId, modules);
  if (count === 0) return { ok: false, error: "Permissões não atualizadas" };

  const hdr = await headers();
  const ip = hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip");
  const userAgent = hdr.get("user-agent");

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "user.permissions_update",
    entity: "User",
    entityId: userId,
    meta: {
      name: target.name,
      modules: modules.length > 0 ? (modules as ModuleKey[]) : "role_default",
    },
    ip,
    userAgent,
  });

  revalidatePath("/admin/permissoes");
  return { ok: true };
}
