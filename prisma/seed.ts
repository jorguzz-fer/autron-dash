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

  // ── Vendedores (planilha de metas real + cargos da planilha de consultores) ──
  // Gated por env: SEED_VENDEDORES=true. Não roda no seed padrão para evitar
  // sobrescrever edições feitas pela UI a cada deploy.
  //
  // Códigos Protheus reais extraídos do extrato de metas 2026 (11 vendedores
  // com metas carregadas). Rembrandt, Helton (internacional) e Representante
  // Autônomo não têm metas neste período → cadastrar quando necessário.
  if (process.env.SEED_VENDEDORES === "true") {
    type V = { codigo: string; nome: string; cargo: string; supervisorCodigo?: string; tipo?: string; ativo?: boolean };
    const vendedores: V[] = [
      { codigo: "000002", nome: "VENDAS INTERNAS (carteira)", cargo: "CONSULTOR DE VENDAS INTERNAS" },
      { codigo: "000006", nome: "WILLIAN CÉSAR SANTOS TOMAZ", cargo: "KEY ACCOUNT MANAGER SIDERURGIA" },
      { codigo: "000007", nome: "MICHEL DE AZEVEDO SAAD", cargo: "CONSULTOR ESPECIALISTA DE VENDAS" },
      { codigo: "000018", nome: "DEWET VIRMOND TAQUES NETO", cargo: "CONSULTOR ESPECIALISTA DE VENDAS" },
      { codigo: "000020", nome: "RAFAEL SILVA DE JESUS", cargo: "CONSULTOR ESPECIALISTA DE VENDAS" },
      { codigo: "000022", nome: "ADRIANO CORREA DE MATOS", cargo: "CONSULTOR DE VENDAS I", ativo: false }, // ex-funcionário
      { codigo: "000024", nome: "CELIO ONOFRE MARCONDES JUNIOR", cargo: "SUPERVISOR DE VENDAS" },
      { codigo: "000025", nome: "JOÃO VITOR RIBEIRO DE SOUZA", cargo: "CONSULTOR DE VENDAS II", supervisorCodigo: "000024" },
      { codigo: "000029", nome: "ALEXSIANO PORFIRIO DA SILVA", cargo: "CONSULTOR DE VENDAS I", supervisorCodigo: "000006" },
      { codigo: "000032", nome: "LEANDRO DA SILVA", cargo: "CONSULTOR DE VENDAS I", supervisorCodigo: "000006" },
      { codigo: "000033", nome: "BRUNO PEREIRA DA SILVA", cargo: "CONSULTOR DE VENDAS I", supervisorCodigo: "000020" },
    ];
    for (const v of vendedores) {
      await prisma.comissaoVendedor.upsert({
        where: { tenantId_codigoProtheus: { tenantId: tenant.id, codigoProtheus: v.codigo } },
        update: { nome: v.nome, cargo: v.cargo, tipo: v.tipo ?? "CLT", supervisorCodigo: v.supervisorCodigo ?? null, ativo: v.ativo ?? true },
        create: { tenantId: tenant.id, codigoProtheus: v.codigo, nome: v.nome, cargo: v.cargo, tipo: v.tipo ?? "CLT", supervisorCodigo: v.supervisorCodigo ?? null, ativo: v.ativo ?? true },
      });
    }
    console.log(`✓ Vendedores: ${vendedores.length} (carteiras: Willian→Alexsiano+Leandro · Célio→João Vitor · Rafael→Bruno)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
