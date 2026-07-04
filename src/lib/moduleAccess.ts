import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/authz";
import { getUserAllowedModules } from "@/lib/services/users";
import { canAccessModule, type ModuleKey } from "@/lib/pageAccess";

/**
 * Guard de rota por MÓDULO (não por perfil). Garante que o usuário autenticado
 * tem acesso efetivo ao módulo — respeitando whitelist por usuário e a allowlist
 * por e-mail (ex.: Enriquecimento, restrito a ADMIN + e-mails específicos).
 *
 * Uso: const guard = await requireModule("ENRIQUECIMENTO");
 *      if (guard.error) return guard.error;
 *      const session = guard.session;
 */
export async function requireModule(moduleKey: ModuleKey) {
  const { session, error } = await requireAuth();
  if (error) return { error };

  const allowedModules = await getUserAllowedModules(
    session!.user.tenantId,
    session!.user.id,
  );

  const ok = canAccessModule(
    {
      role: session!.user.role,
      allowedModules,
      email: session!.user.email,
    },
    moduleKey,
  );

  if (!ok) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { session: session! };
}
