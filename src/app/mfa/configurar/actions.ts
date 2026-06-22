"use server";

import { headers } from "next/headers";
import { auth, unstable_update } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rateLimit";
import { confirmMfaSetup } from "@/lib/services/mfa";

type ConfirmResult = { ok: true; backupCodes: string[] } | { ok: false; error: string };

async function getIp() {
  const hdr = await headers();
  return hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip");
}

/**
 * Confirma a configuração do MFA validando o primeiro código TOTP. Em caso de
 * sucesso, ativa o segundo fator, devolve os códigos de recuperação (exibidos
 * uma única vez) e marca a sessão como verificada — liberando o acesso ao app.
 */
export async function confirmarSetup(input: { code: string }): Promise<ConfirmResult> {
  const session = await auth();
  if (!session) return { ok: false, error: "Sessão inválida" };

  const limit = await rateLimit({
    key: `mfa:setup:${session.user.id}`,
    windowSec: 900,
    max: 10,
  });
  if (!limit.allowed) {
    return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
  }

  const code = (input.code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: "Informe o código de 6 dígitos do app autenticador." };
  }

  const backupCodes = await confirmMfaSetup(session.user.id, code);
  if (!backupCodes) {
    return { ok: false, error: "Código inválido. Verifique a hora do dispositivo e tente de novo." };
  }

  // Sessão passa a estar com MFA ativo e verificado → libera o app.
  await unstable_update({ user: { mfaEnabled: true, mfaVerified: true } });

  const ip = await getIp();
  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "user.mfa_enabled",
    entity: "User",
    entityId: session.user.id,
    ip,
  });

  return { ok: true, backupCodes };
}
