"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password";
import { hashPassword, setPasswordHashInTenant } from "@/lib/services/users";

type SimpleResult = { ok: true } | { ok: false; error: string };

async function getIp() {
  const hdr = await headers();
  return hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip");
}

export async function alterarSenhaPropria(input: {
  password: string;
  confirm: string;
}): Promise<SimpleResult> {
  const session = await auth();
  if (!session) return { ok: false, error: "Sessão inválida" };

  if (input.password !== input.confirm) {
    return { ok: false, error: "As senhas não coincidem" };
  }

  const pwCheck = validatePassword(input.password);
  if (!pwCheck.ok) return { ok: false, error: pwCheck.error ?? "Senha inválida" };

  try {
    const hash = await hashPassword(input.password);
    // mustChangePassword: false — o próprio usuário está escolhendo a senha
    const count = await setPasswordHashInTenant(
      session.user.tenantId,
      session.user.id,
      hash,
      false,
    );
    if (count === 0) return { ok: false, error: "Não foi possível atualizar a senha" };

    const ip = await getIp();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "user.password_self_change",
      entity: "User",
      entityId: session.user.id,
      meta: { reason: "first_login_forced" },
      ip,
    });

    return { ok: true };
  } catch {
    return { ok: false, error: "Erro interno ao atualizar senha" };
  }
}
