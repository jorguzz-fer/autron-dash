"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCapability, type Role } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { CAPABILITY_KEYS } from "@/lib/capabilities";
import { MODULES } from "@/lib/pageAccess";
import {
  createPerfil,
  updatePerfil,
  deletePerfil,
  findPerfilInTenant,
} from "@/lib/services/perfis";

type SimpleResult = { ok: true } | { ok: false; error: string };
type CreateResult = { ok: true; id: string } | { ok: false; error: string };

const ROLE_VALUES = ["ADMIN", "DIRETOR", "GERENTE", "OPERADOR", "VIEWER", "CONTROLADORIA"] as const;
const MODULE_KEYS = MODULES.map((m) => m.key) as [string, ...string[]];

const perfilSchema = z.object({
  label: z.string().trim().min(2, "Nome muito curto").max(60),
  descricao: z.string().trim().max(200).optional().nullable(),
  baseRole: z.enum(ROLE_VALUES),
  modules: z.array(z.enum(MODULE_KEYS)).default([]),
  capabilities: z.array(z.enum(CAPABILITY_KEYS as [string, ...string[]])).default([]),
});

async function meta() {
  const hdr = await headers();
  const ip = hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip");
  const userAgent = hdr.get("user-agent");
  return { ip, userAgent };
}

export async function criarPerfilAction(input: {
  label: string;
  descricao?: string | null;
  baseRole: string;
  modules: string[];
  capabilities: string[];
}): Promise<CreateResult> {
  const guard = await requireCapability("MANAGE_USERS");
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const parsed = perfilSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    const created = await createPerfil(session.user.tenantId, {
      label: parsed.data.label,
      descricao: parsed.data.descricao ?? null,
      baseRole: parsed.data.baseRole as Role,
      modules: parsed.data.modules,
      capabilities: parsed.data.capabilities,
    });

    const { ip, userAgent } = await meta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "perfil.create",
      entity: "Perfil",
      entityId: created.id,
      meta: { label: created.label, baseRole: created.baseRole },
      ip,
      userAgent,
    });

    revalidatePath("/admin/perfis");
    return { ok: true, id: created.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro ao criar perfil" };
  }
}

export async function atualizarPerfilAction(input: {
  id: string;
  label: string;
  descricao?: string | null;
  baseRole: string;
  modules: string[];
  capabilities: string[];
}): Promise<SimpleResult> {
  const guard = await requireCapability("MANAGE_USERS");
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const id = input.id?.trim();
  if (!id) return { ok: false, error: "ID obrigatório" };

  const parsed = perfilSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const target = await findPerfilInTenant(session.user.tenantId, id);
  if (!target) return { ok: false, error: "Perfil não encontrado" };

  let capabilities = parsed.data.capabilities;
  let baseRole = parsed.data.baseRole as Role;

  // Anti-lockout: o perfil de sistema ADMIN não pode perder MANAGE_USERS nem
  // deixar de ser baseRole ADMIN — senão ninguém mais administra o tenant.
  if (target.isSystem && target.nome === "ADMIN") {
    if (!capabilities.includes("MANAGE_USERS")) {
      capabilities = [...capabilities, "MANAGE_USERS"];
    }
    baseRole = "ADMIN";
  }

  try {
    const count = await updatePerfil(session.user.tenantId, id, {
      label: parsed.data.label,
      descricao: parsed.data.descricao ?? null,
      baseRole,
      modules: parsed.data.modules,
      capabilities,
    });
    if (count === 0) return { ok: false, error: "Perfil não atualizado" };

    const { ip, userAgent } = await meta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "perfil.update",
      entity: "Perfil",
      entityId: id,
      meta: {
        label: parsed.data.label,
        modules: parsed.data.modules.length,
        capabilities: capabilities.length,
      },
      ip,
      userAgent,
    });

    revalidatePath("/admin/perfis");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Erro ao atualizar perfil" };
  }
}

export async function excluirPerfilAction(input: { id: string }): Promise<SimpleResult> {
  const guard = await requireCapability("MANAGE_USERS");
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const id = input.id?.trim();
  if (!id) return { ok: false, error: "ID obrigatório" };

  const target = await findPerfilInTenant(session.user.tenantId, id);
  if (!target) return { ok: false, error: "Perfil não encontrado" };
  if (target.isSystem) return { ok: false, error: "Perfis de sistema não podem ser excluídos" };

  const removed = await deletePerfil(session.user.tenantId, id);
  if (removed.count === 0) {
    return { ok: false, error: "Perfil não excluído (em uso ou de sistema)" };
  }

  const { ip, userAgent } = await meta();
  await logAudit({
    tenantId: session.user.tenantId,
    userId: session.user.id,
    action: "perfil.delete",
    entity: "Perfil",
    entityId: id,
    meta: { label: target.label },
    ip,
    userAgent,
  });

  revalidatePath("/admin/perfis");
  return { ok: true };
}
