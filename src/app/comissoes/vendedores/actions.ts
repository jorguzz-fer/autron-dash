"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, type Role } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

type OkEmpty = { ok: true };
type Err = { ok: false; error: string };
type SimpleResult = OkEmpty | Err;

const ALLOWED_ROLES: Role[] = ["ADMIN", "DIRETOR", "CONTROLADORIA"];

const TIPO_VALUES = ["CLT", "PJ", "REPRESENTANTE"] as const;
const BASE_VALUES = ["INDIVIDUAL", "COLETIVO", "CARTEIRA"] as const;

async function getRequestMeta() {
  const hdr = await headers();
  const ip = hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip");
  const userAgent = hdr.get("user-agent");
  return { ip, userAgent };
}

// ─────────────────────────── Vendedor ────────────────────────────────────────

const vendedorSchema = z.object({
  codigoProtheus: z.string().trim().min(1, "Código Protheus obrigatório").max(30),
  nome: z.string().trim().min(2, "Nome muito curto").max(120),
  cargo: z.string().trim().min(1, "Cargo obrigatório").max(60),
  tipo: z.enum(TIPO_VALUES, { errorMap: () => ({ message: "Tipo inválido" }) }),
  nivel: z.coerce.number().int().min(1).max(10).optional().nullable(),
  gatilhoOverride: z.coerce.number().min(0).max(9.9999).optional().nullable(),
  ativo: z.boolean().optional(),
});

export async function criarVendedor(input: {
  codigoProtheus: string;
  nome: string;
  cargo: string;
  tipo: string;
  nivel?: number | null;
  gatilhoOverride?: number | null;
  ativo?: boolean;
}): Promise<SimpleResult> {
  const guard = await requireRole(ALLOWED_ROLES);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const parsed = vendedorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const { codigoProtheus, nome, cargo, tipo, nivel, gatilhoOverride, ativo } = parsed.data;

  // Unicidade: tenantId + codigoProtheus
  const existing = await prisma.comissaoVendedor.findFirst({
    where: { tenantId: session.user.tenantId, codigoProtheus },
  });
  if (existing) {
    return { ok: false, error: `Já existe um vendedor com o código ${codigoProtheus}` };
  }

  try {
    const created = await prisma.comissaoVendedor.create({
      data: {
        tenantId: session.user.tenantId,
        codigoProtheus,
        nome,
        cargo,
        tipo,
        nivel: nivel ?? null,
        gatilhoOverride: gatilhoOverride ?? null,
        ativo: ativo ?? true,
      },
    });

    const { ip, userAgent } = await getRequestMeta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "comissao.vendedor.create",
      entity: "ComissaoVendedor",
      entityId: created.id,
      meta: { codigoProtheus, nome, cargo, tipo },
      ip,
      userAgent,
    });

    revalidatePath("/comissoes/vendedores");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao criar vendedor";
    return { ok: false, error: message };
  }
}

export async function atualizarVendedor(
  id: string,
  input: {
    codigoProtheus: string;
    nome: string;
    cargo: string;
    tipo: string;
    nivel?: number | null;
    gatilhoOverride?: number | null;
    ativo?: boolean;
  },
): Promise<SimpleResult> {
  const guard = await requireRole(ALLOWED_ROLES);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  if (!id?.trim()) return { ok: false, error: "ID obrigatório" };

  const parsed = vendedorSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const { codigoProtheus, nome, cargo, tipo, nivel, gatilhoOverride, ativo } = parsed.data;

  // Anti cross-tenant
  const target = await prisma.comissaoVendedor.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!target) return { ok: false, error: "Vendedor não encontrado" };

  // Se mudou código, verificar unicidade
  if (target.codigoProtheus !== codigoProtheus) {
    const conflict = await prisma.comissaoVendedor.findFirst({
      where: { tenantId: session.user.tenantId, codigoProtheus },
    });
    if (conflict && conflict.id !== id) {
      return { ok: false, error: `Código ${codigoProtheus} já em uso por outro vendedor` };
    }
  }

  try {
    await prisma.comissaoVendedor.update({
      where: { id },
      data: {
        codigoProtheus,
        nome,
        cargo,
        tipo,
        nivel: nivel ?? null,
        gatilhoOverride: gatilhoOverride ?? null,
        ativo: ativo ?? target.ativo,
      },
    });

    const { ip, userAgent } = await getRequestMeta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "comissao.vendedor.update",
      entity: "ComissaoVendedor",
      entityId: id,
      meta: {
        before: { codigoProtheus: target.codigoProtheus, nome: target.nome, cargo: target.cargo },
        after: { codigoProtheus, nome, cargo, tipo },
      },
      ip,
      userAgent,
    });

    revalidatePath("/comissoes/vendedores");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar vendedor";
    return { ok: false, error: message };
  }
}

// ─────────────────────────── Cargo ───────────────────────────────────────────

const cargoSchema = z.object({
  ano: z.coerce.number().int().min(2020).max(2099),
  cargo: z.string().trim().min(1, "Cargo obrigatório").max(60),
  comissaoPct: z.coerce
    .number()
    .min(0, "Comissão não pode ser negativa")
    .max(9.9999, "Comissão máxima: 9.9999"),
  gatilhoPct: z.coerce
    .number()
    .min(0, "Gatilho não pode ser negativo")
    .max(9.9999, "Gatilho máximo: 9.9999"),
  base: z.enum(BASE_VALUES, { errorMap: () => ({ message: "Base inválida" }) }),
});

export async function criarCargo(input: {
  ano: number;
  cargo: string;
  comissaoPct: number;
  gatilhoPct: number;
  base: string;
}): Promise<SimpleResult> {
  const guard = await requireRole(ALLOWED_ROLES);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const parsed = cargoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const { ano, cargo, comissaoPct, gatilhoPct, base } = parsed.data;

  // Unicidade: tenantId + ano + cargo
  const existing = await prisma.comissaoCargo.findFirst({
    where: { tenantId: session.user.tenantId, ano, cargo },
  });
  if (existing) {
    return { ok: false, error: `Cargo "${cargo}" já cadastrado para ${ano}` };
  }

  try {
    const created = await prisma.comissaoCargo.create({
      data: {
        tenantId: session.user.tenantId,
        ano,
        cargo,
        comissaoPct,
        gatilhoPct,
        base,
      },
    });

    const { ip, userAgent } = await getRequestMeta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "comissao.cargo.create",
      entity: "ComissaoCargo",
      entityId: created.id,
      meta: { ano, cargo, comissaoPct, gatilhoPct, base },
      ip,
      userAgent,
    });

    revalidatePath("/comissoes/vendedores");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao criar cargo";
    return { ok: false, error: message };
  }
}

export async function atualizarCargo(
  id: string,
  input: {
    ano: number;
    cargo: string;
    comissaoPct: number;
    gatilhoPct: number;
    base: string;
  },
): Promise<SimpleResult> {
  const guard = await requireRole(ALLOWED_ROLES);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  if (!id?.trim()) return { ok: false, error: "ID obrigatório" };

  const parsed = cargoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const { ano, cargo, comissaoPct, gatilhoPct, base } = parsed.data;

  // Anti cross-tenant
  const target = await prisma.comissaoCargo.findFirst({
    where: { id, tenantId: session.user.tenantId },
  });
  if (!target) return { ok: false, error: "Cargo não encontrado" };

  // Se mudou ano+cargo, verificar unicidade
  if (target.ano !== ano || target.cargo !== cargo) {
    const conflict = await prisma.comissaoCargo.findFirst({
      where: { tenantId: session.user.tenantId, ano, cargo },
    });
    if (conflict && conflict.id !== id) {
      return { ok: false, error: `Cargo "${cargo}" já cadastrado para ${ano}` };
    }
  }

  try {
    await prisma.comissaoCargo.update({
      where: { id },
      data: { ano, cargo, comissaoPct, gatilhoPct, base },
    });

    const { ip, userAgent } = await getRequestMeta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "comissao.cargo.update",
      entity: "ComissaoCargo",
      entityId: id,
      meta: {
        before: { ano: target.ano, cargo: target.cargo },
        after: { ano, cargo, comissaoPct, gatilhoPct, base },
      },
      ip,
      userAgent,
    });

    revalidatePath("/comissoes/vendedores");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar cargo";
    return { ok: false, error: message };
  }
}
