import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export type Role = "ADMIN" | "DIRETOR" | "GERENTE" | "OPERADOR" | "VIEWER" | "CONTROLADORIA";

export async function requireAuth() {
  const session = await auth();
  if (!session) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  }
  // Defense-in-depth: além do gate do middleware, nenhum recurso protegido é
  // liberado para sessões que ainda não completaram a troca de senha ou o MFA
  // (segundo fator obrigatório para todos). As próprias telas de /mudar-senha
  // e /mfa usam `auth()` direto, então não passam por aqui.
  if (session.user.mustChangePassword || !session.user.mfaEnabled || !session.user.mfaVerified) {
    return { error: NextResponse.json({ error: "Verificação de segurança pendente" }, { status: 403 }) };
  }
  return { session };
}

export async function requireRole(roles: Role[]) {
  const { session, error } = await requireAuth();
  if (error) return { error };
  const role = session!.user.role as Role;
  if (!roles.includes(role)) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  }
  return { session: session! };
}

export const ROLES_ADMIN: Role[]         = ["ADMIN"];
export const ROLES_MANAGE: Role[]        = ["ADMIN", "DIRETOR", "GERENTE"];
export const ROLES_WRITE: Role[]         = ["ADMIN", "DIRETOR", "GERENTE", "OPERADOR"];
export const ROLES_READ: Role[]          = ["ADMIN", "DIRETOR", "GERENTE", "OPERADOR", "VIEWER"];
// Acesso ao módulo de Conciliação (Demanda 1 — Controladoria/Autron).
// CONTROLADORIA é a role dedicada da Dai e do time financeiro/fiscal dela;
// ADMIN entra junto pra suporte/manutenção.
export const ROLES_CONTROLADORIA: Role[] = ["ADMIN", "CONTROLADORIA"];
