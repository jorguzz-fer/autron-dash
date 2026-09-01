"use strict";
/**
 * Seed runner (versão JS, sem tsx) — para uso dentro do container Coolify.
 * Lê SEED_* do env e cria/atualiza tenant + admin.
 *
 * Uso: node /app/scripts/seed-admin.js [--reset-password] [--unlock] [--help]
 *
 * Por padrão a senha só é gravada quando o usuário é CRIADO. Num usuário que
 * já existe ela é preservada de propósito — rodar o seed de novo não pode
 * desfazer uma troca de senha feita pelo próprio usuário. O efeito colateral
 * é que mudar SEED_ADMIN_PASSWORD no painel e rodar o seed não muda nada;
 * isso já custou um "credenciais inválidas" inexplicável, então agora o
 * script AVISA em vez de fingir sucesso. Para trocar de fato: --reset-password.
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

const HELP = `
seed-admin — cria/atualiza o tenant e o usuário admin a partir das SEED_*

  node scripts/seed-admin.js                    cria se não existir (senha só na criação)
  node scripts/seed-admin.js --reset-password   regrava a senha com SEED_ADMIN_PASSWORD
  node scripts/seed-admin.js --unlock           limpa o rate limit de login do admin
  node scripts/seed-admin.js --help             esta ajuda

--reset-password já inclui o --unlock: quem precisa trocar a senha em geral
está trancado do lado de fora.

Variáveis lidas: SEED_TENANT_SLUG, SEED_TENANT_NAME, SEED_ADMIN_EMAIL,
SEED_ADMIN_NAME, SEED_ADMIN_PASSWORD.
`;

/** Erro de uso (env faltando, senha curta): mostra a mensagem, sem stack. */
function erroDeUso(mensagem) {
  const e = new Error(mensagem);
  e.esperado = true;
  return e;
}

/**
 * Zera as tentativas de login contabilizadas para este e-mail. O limite por
 * IP (20 / 15 min) não é tocado — não dá para saber o IP aqui, e ele expira
 * sozinho na janela. Ver lib/rateLimit.
 */
async function unlock(email) {
  const removidos = await prisma.$executeRawUnsafe(
    `DELETE FROM "RateLimitHit" WHERE "key" = $1`,
    `login:email:${email}`,
  );
  console.log(`unlock: ${removidos} tentativa(s) de login limpa(s) para ${email}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP.trim());
    return;
  }
  const resetPassword = args.includes("--reset-password");
  const soUnlock = args.includes("--unlock") && !resetPassword;

  const tenantSlug = process.env.SEED_TENANT_SLUG || "autron";
  const tenantName = process.env.SEED_TENANT_NAME || "Autron";
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "fer.jorge@gmail.com").toLowerCase();
  const adminName = process.env.SEED_ADMIN_NAME || "Fernando Jorge";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (soUnlock) {
    await unlock(adminEmail);
    return;
  }

  if (!adminPassword) {
    throw erroDeUso("SEED_ADMIN_PASSWORD não configurada no environment.");
  }
  if (adminPassword.length < 10) {
    throw erroDeUso("SEED_ADMIN_PASSWORD deve ter ao menos 10 caracteres.");
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: tenantName, active: true },
    create: { slug: tenantSlug, name: tenantName, active: true },
  });
  console.log(`tenant: ${tenant.slug} (${tenant.id})`);

  const existente = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    select: { id: true },
  });

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const dadosComuns = { name: adminName, role: "ADMIN", active: true };

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: resetPassword ? { ...dadosComuns, passwordHash } : dadosComuns,
    create: { tenantId: tenant.id, email: adminEmail, ...dadosComuns, passwordHash },
  });
  console.log(`admin: ${admin.email} (${admin.id})`);

  if (!existente) {
    console.log("senha: definida a partir de SEED_ADMIN_PASSWORD (usuário criado agora)");
    return;
  }

  if (resetPassword) {
    console.log("senha: REGRAVADA a partir de SEED_ADMIN_PASSWORD");
    await unlock(adminEmail);
    return;
  }

  // O caso que enganava: usuário já existia, o seed "deu certo", e a senha
  // continuou sendo a antiga.
  console.log("");
  console.log("⚠  ATENÇÃO: o usuário já existia — a SENHA NÃO FOI ALTERADA.");
  console.log("   A senha continua sendo a que já estava no banco, não a do");
  console.log("   SEED_ADMIN_PASSWORD atual. Para trocar de fato:");
  console.log("");
  console.log("     node scripts/seed-admin.js --reset-password");
  console.log("");
}

main()
  .catch((e) => {
    // Erro de uso: só a mensagem. Erro inesperado (banco fora, schema
    // divergente): stack completo, que é o que ajuda a diagnosticar.
    console.error(e.esperado ? `erro: ${e.message}` : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
