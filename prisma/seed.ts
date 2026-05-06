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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
