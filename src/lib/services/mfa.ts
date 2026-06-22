import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/mfaCrypto";
import {
  generateTotpSecret,
  verifyTotp,
  buildOtpauthUri,
  formatSecretForDisplay,
} from "@/lib/totp";

export const BACKUP_CODE_COUNT = 10;
// Alfabeto sem caracteres ambíguos (0/O, 1/I/L) para digitação manual.
const BACKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface MfaSetupData {
  secret: string; // base32 em claro — exibido só durante a configuração
  secretFormatted: string;
  otpauthUri: string;
}

/** Estado de MFA do usuário (para guards/UI). */
export async function getUserMfaState(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true, mfaSecret: true },
  });
  return { mfaEnabled: u?.mfaEnabled ?? false, hasSecret: !!u?.mfaSecret };
}

/**
 * Gera um novo segredo TOTP, guarda CIFRADO como "pendente" (mfaEnabled
 * permanece false) e devolve os dados para montar o QR. Cada chamada gera um
 * segredo novo — se o usuário recarregar a página de setup, o anterior é
 * descartado (ainda não confirmado).
 */
/**
 * Prepara o setup: devolve os dados para montar o QR. É IDEMPOTENTE e
 * não-destrutiva — roda no render (GET) da página de configuração, então NÃO
 * pode alterar `mfaEnabled` (senão um re-render/prefetch do Next reverteria um
 * MFA já ativo). Reaproveita um segredo pendente existente para manter o QR
 * estável entre reloads; só gera e grava um novo se não houver nenhum.
 */
export async function startMfaSetup(args: {
  userId: string;
  account: string;
  issuer: string;
}): Promise<MfaSetupData> {
  const u = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { mfaEnabled: true, mfaSecret: true },
  });

  let secret: string | null = null;
  // Só reaproveita o segredo se ainda for pendente (MFA não confirmado). Para
  // um usuário já habilitado esta função não deveria ser chamada (a página
  // redireciona), mas, por garantia, nunca sobrescrevemos um segredo ativo.
  if (u && !u.mfaEnabled && u.mfaSecret) {
    try {
      secret = decryptSecret(u.mfaSecret);
    } catch {
      secret = null;
    }
  }
  if (!secret) {
    secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: args.userId },
      data: { mfaSecret: encryptSecret(secret) },
    });
  }

  return {
    secret,
    secretFormatted: formatSecretForDisplay(secret),
    otpauthUri: buildOtpauthUri({ secretBase32: secret, account: args.account, issuer: args.issuer }),
  };
}

/**
 * Confirma o setup: valida o primeiro código contra o segredo pendente. Se ok,
 * ativa o MFA e (re)gera os códigos de recuperação, devolvendo-os em claro
 * uma única vez. Retorna null se o código for inválido ou não houver segredo.
 */
export async function confirmMfaSetup(userId: string, code: string): Promise<string[] | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaSecret: true },
  });
  if (!u?.mfaSecret) return null;

  let secret: string;
  try {
    secret = decryptSecret(u.mfaSecret);
  } catch {
    return null;
  }
  if (!verifyTotp(secret, code)) return null;

  const codes = generateBackupCodes();
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(normalizeBackupCode(c), 10)));

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaConfirmedAt: new Date() },
    }),
    prisma.mfaBackupCode.deleteMany({ where: { userId } }),
    prisma.mfaBackupCode.createMany({
      data: hashes.map((codeHash) => ({ userId, codeHash })),
    }),
  ]);

  return codes;
}

/** Valida um código TOTP de um usuário com MFA já ativo. */
export async function verifyUserTotpCode(userId: string, code: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true, mfaSecret: true },
  });
  if (!u?.mfaEnabled || !u.mfaSecret) return false;
  try {
    return verifyTotp(decryptSecret(u.mfaSecret), code);
  } catch {
    return false;
  }
}

/**
 * Consome um código de recuperação (one-time). Compara contra os hashes não
 * usados; ao casar, marca usedAt e retorna true.
 */
export async function consumeBackupCode(userId: string, code: string): Promise<boolean> {
  const normalized = normalizeBackupCode(code);
  if (!/^[A-Z0-9]{8}$/.test(normalized)) return false;

  const rows = await prisma.mfaBackupCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });
  for (const row of rows) {
    if (await bcrypt.compare(normalized, row.codeHash)) {
      await prisma.mfaBackupCode.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      return true;
    }
  }
  return false;
}

/** Quantos códigos de recuperação ainda restam (para alertar o usuário). */
export async function countUnusedBackupCodes(userId: string): Promise<number> {
  return prisma.mfaBackupCode.count({ where: { userId, usedAt: null } });
}

/**
 * Reset administrativo: zera o MFA de um usuário do tenant (perda de
 * dispositivo). Ele será forçado a reconfigurar no próximo acesso.
 * Retorna o nº de usuários afetados (0 = não encontrado/outro tenant).
 */
export async function resetUserMfa(tenantId: string, userId: string): Promise<number> {
  const res = await prisma.user.updateMany({
    where: { id: userId, tenantId },
    data: { mfaEnabled: false, mfaSecret: null, mfaConfirmedAt: null },
  });
  if (res.count > 0) {
    await prisma.mfaBackupCode.deleteMany({ where: { userId } });
  }
  return res.count;
}

// ── Helpers de códigos de recuperação ──────────────────────────────────────

function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    let raw = "";
    for (let j = 0; j < 8; j++) raw += BACKUP_ALPHABET[randomInt(BACKUP_ALPHABET.length)];
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

function normalizeBackupCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
