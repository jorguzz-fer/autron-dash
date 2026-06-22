"use server";

import { headers } from "next/headers";
import { auth, unstable_update } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rateLimit } from "@/lib/rateLimit";
import { verifyUserTotpCode, consumeBackupCode } from "@/lib/services/mfa";

type VerifyResult = { ok: true } | { ok: false; error: string };

async function getIp() {
  const hdr = await headers();
  return hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip");
}

/**
 * Valida o segundo fator desta sessão: aceita o código TOTP (6 dígitos) ou um
 * código de recuperação (XXXX-XXXX). Em caso de sucesso marca a sessão como
 * verificada, liberando o acesso ao painel.
 */
export async function verificarCodigo(input: { code: string }): Promise<VerifyResult> {
  const session = await auth();
  if (!session) return { ok: false, error: "Sessão inválida" };
  if (!session.user.mfaEnabled) return { ok: false, error: "MFA não configurado" };

  const limit = await rateLimit({
    key: `mfa:verify:${session.user.id}`,
    windowSec: 900,
    max: 10,
  });
  if (!limit.allowed) {
    return { ok: false, error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." };
  }

  const raw = (input.code ?? "").trim();
  const ip = await getIp();

  // TOTP (6 dígitos) tem precedência; caso contrário tenta código de recuperação.
  const isTotp = /^\d{6}$/.test(raw.replace(/\s+/g, ""));
  let usedBackup = false;
  let success = false;

  if (isTotp) {
    success = await verifyUserTotpCode(session.user.id, raw);
  }
  if (!success) {
    success = await consumeBackupCode(session.user.id, raw);
    usedBackup = success;
  }

  if (!success) {
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "user.mfa_failed",
      entity: "User",
      entityId: session.user.id,
      ip,
    });
    return { ok: false, error: "Código inválido. Tente novamente." };
  }

  await unstable_update({ user: { mfaVerified: true } });

  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: usedBackup ? "user.mfa_backup_used" : "user.mfa_verified",
    entity: "User",
    entityId: session.user.id,
    ip,
  });

  return { ok: true };
}
