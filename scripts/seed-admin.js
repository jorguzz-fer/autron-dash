"use strict";
/**
 * Seed runner (versão JS, sem tsx) — para uso dentro do container Coolify.
 * Lê SEED_* do env e cria/atualiza tenant + admin.
 *
 * Uso: node /app/scripts/seed-admin.js
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const tenantSlug = process.env.SEED_TENANT_SLUG || "autron";
  const tenantName = process.env.SEED_TENANT_NAME || "Autron";
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || "fer.jorge@gmail.com").toLowerCase();
  const adminName = process.env.SEED_ADMIN_NAME || "Fernando Jorge";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new Error("SEED_ADMIN_PASSWORD não configurada no environment.");
  }
  if (adminPassword.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD deve ter ao menos 10 caracteres.");
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: tenantName, active: true },
    create: { slug: tenantSlug, name: tenantName, active: true },
  });
  console.log(`tenant: ${tenant.slug} (${tenant.id})`);

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: { name: adminName, role: "ADMIN", active: true },
    create: {
      tenantId: tenant.id,
      email: adminEmail,
      name: adminName,
      role: "ADMIN",
      active: true,
      passwordHash,
    },
  });
  console.log(`admin: ${admin.email} (${admin.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
