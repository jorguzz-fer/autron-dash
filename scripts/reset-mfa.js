"use strict";
/**
 * Reset de MFA (versão JS, sem tsx) — para uso dentro do container Coolify.
 *
 * Zera o segundo fator: limpa mfaEnabled/mfaSecret/mfaConfirmedAt e apaga os
 * códigos de recuperação. No próximo login o usuário é forçado a reconfigurar
 * o app autenticador do zero.
 *
 * Uso:
 *   node /app/scripts/reset-mfa.js                      # TODOS os usuários
 *   node /app/scripts/reset-mfa.js fer.jorge@gmail.com  # apenas um e-mail
 */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const email = (process.argv[2] || "").toLowerCase().trim();

  const where = email ? { email } : {};

  const targets = await prisma.user.findMany({
    where,
    select: { id: true, email: true, mfaEnabled: true },
  });

  if (targets.length === 0) {
    console.log(email ? `Nenhum usuário com e-mail "${email}".` : "Nenhum usuário encontrado.");
    return;
  }

  const ids = targets.map((u) => u.id);

  const deletedCodes = await prisma.mfaBackupCode.deleteMany({
    where: { userId: { in: ids } },
  });

  const updated = await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { mfaEnabled: false, mfaSecret: null, mfaConfirmedAt: null },
  });

  console.log(`✓ MFA resetado para ${updated.count} usuário(s):`);
  for (const u of targets) {
    console.log(`  - ${u.email}${u.mfaEnabled ? " (estava ativo)" : ""}`);
  }
  console.log(`✓ ${deletedCodes.count} código(s) de recuperação removido(s).`);
  console.log("No próximo login esses usuários vão reconfigurar o MFA do zero.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
