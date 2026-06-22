import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const tenantSlug = process.env.SEED_TENANT_SLUG ?? "autron";
  const tenantName = process.env.SEED_TENANT_NAME ?? "Autron";
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "fer.jorge@gmail.com").toLowerCase();
  const adminName = process.env.SEED_ADMIN_NAME ?? "Fernando Jorge";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword) {
    throw new Error(
      "SEED_ADMIN_PASSWORD não configurada. Defina-a no .env antes de rodar o seed.",
    );
  }
  if (adminPassword.length < 10) {
    throw new Error("SEED_ADMIN_PASSWORD deve ter ao menos 10 caracteres.");
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: tenantName, active: true },
    create: { slug: tenantSlug, name: tenantName, active: true },
  });
  console.log(`✓ Tenant: ${tenant.slug} (${tenant.id})`);

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: adminEmail } },
    update: {
      name: adminName,
      role: Role.ADMIN,
      active: true,
    },
    create: {
      tenantId: tenant.id,
      email: adminEmail,
      name: adminName,
      role: Role.ADMIN,
      active: true,
      passwordHash,
    },
  });
  console.log(`✓ Admin: ${admin.email} (${admin.id})`);

  // ── Cargos de comissão (Política abr/26) ────────────────────────────────────
  // Versionados por ano; nomes batem com a planilha de Consultores da Autron.
  const anoCargos = Number(process.env.SEED_COMISSAO_ANO ?? new Date().getFullYear());
  const cargos: { cargo: string; comissaoPct: number; gatilhoPct: number; base: string }[] = [
    { cargo: "CONSULTOR DE VENDAS I", comissaoPct: 0.015, gatilhoPct: 0.7, base: "INDIVIDUAL" },
    { cargo: "CONSULTOR DE VENDAS II", comissaoPct: 0.015, gatilhoPct: 0.7, base: "INDIVIDUAL" },
    { cargo: "CONSULTOR ESPECIALISTA DE VENDAS", comissaoPct: 0.01, gatilhoPct: 0.7, base: "INDIVIDUAL" },
    { cargo: "CONSULTOR DE VENDAS INTERNAS", comissaoPct: 0.005, gatilhoPct: 0.7, base: "CARTEIRA" },
    { cargo: "SUPERVISOR DE VENDAS", comissaoPct: 0.0075, gatilhoPct: 0.7, base: "CARTEIRA" },
    { cargo: "KEY ACCOUNT MANAGER SIDERURGIA", comissaoPct: 0.005, gatilhoPct: 0.7, base: "CARTEIRA" },
    { cargo: "VENDAS INTERNACIONAIS", comissaoPct: 0.015, gatilhoPct: 0, base: "CARTEIRA" },
    // Representante Autônomo: % a definir com o Leandro (N1); sem gatilho.
    { cargo: "REPRESENTANTE AUTÔNOMO", comissaoPct: 0, gatilhoPct: 0, base: "INDIVIDUAL" },
  ];
  for (const c of cargos) {
    await prisma.comissaoCargo.upsert({
      where: { tenantId_ano_cargo: { tenantId: tenant.id, ano: anoCargos, cargo: c.cargo } },
      update: { comissaoPct: c.comissaoPct, gatilhoPct: c.gatilhoPct, base: c.base },
      create: { tenantId: tenant.id, ano: anoCargos, ...c },
    });
  }
  console.log(`✓ Cargos de comissão (${anoCargos}): ${cargos.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
