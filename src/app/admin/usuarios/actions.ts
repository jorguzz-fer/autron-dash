"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  requireRole,
  ROLES_ADMIN,
  type Role,
} from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { validatePassword } from "@/lib/password";
import {
  createUserInTenant,
  findUserByEmailInTenant,
  findUserInTenant,
  hashPassword,
  setPasswordHashInTenant,
  updateUserInTenant,
} from "@/lib/services/users";

type OkEmpty = { ok: true };
type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;
type SimpleResult = OkEmpty | Err;

const ROLE_VALUES = [
  "ADMIN",
  "DIRETOR",
  "GERENTE",
  "OPERADOR",
  "VIEWER",
  "CONTROLADORIA",
] as const;

const emailSchema = z.string().email("E-mail inválido").max(200).transform((s) => s.toLowerCase());
const roleSchema = z.enum(ROLE_VALUES);
const nameSchema = z.string().trim().min(2, "Nome muito curto").max(120);

async function getRequestMeta() {
  const hdr = await headers();
  const ip = hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip");
  const userAgent = hdr.get("user-agent");
  return { ip, userAgent };
}

// ───────────────────────── Criar ──────────────────────────────────────────

const criarUsuarioSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: roleSchema,
  password: z.string(),
});

export async function criarUsuario(input: {
  name: string;
  email: string;
  role: string;
  password: string;
}): Promise<Result<{ id: string }>> {
  const guard = await requireRole(ROLES_ADMIN);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const parsed = criarUsuarioSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const { name, email, role, password } = parsed.data;

  const pwCheck = validatePassword(password);
  if (!pwCheck.ok) return { ok: false, error: pwCheck.error ?? "Senha inválida" };

  // Não pode existir outro usuário com mesmo email no tenant
  const existing = await findUserByEmailInTenant(session.user.tenantId, email);
  if (existing) {
    return { ok: false, error: "Já existe um usuário com este e-mail neste tenant" };
  }

  try {
    const passwordHash = await hashPassword(password);
    const created = await createUserInTenant({
      tenantId: session.user.tenantId,
      name,
      email,
      role,
      passwordHash,
    });

    const { ip, userAgent } = await getRequestMeta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "user.create",
      entity: "User",
      entityId: created.id,
      meta: { name, email, role },
      ip,
      userAgent,
    });

    revalidatePath("/admin/usuarios");
    return { ok: true, id: created.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao criar usuário";
    return { ok: false, error: message };
  }
}

// ───────────────────────── Atualizar (name/email/role) ───────────────────

const atualizarUsuarioSchema = z.object({
  id: z.string().min(1),
  name: nameSchema,
  email: emailSchema,
  role: roleSchema,
});

export async function atualizarUsuario(input: {
  id: string;
  name: string;
  email: string;
  role: string;
}): Promise<SimpleResult> {
  const guard = await requireRole(ROLES_ADMIN);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const parsed = atualizarUsuarioSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  const { id, name, email, role } = parsed.data;

  const target = await findUserInTenant(session.user.tenantId, id);
  if (!target) return { ok: false, error: "Usuário não encontrado" };

  // Proteção: não permite rebaixar a si mesmo (evita lock-out de ADMIN)
  if (target.id === session.user.id && role !== "ADMIN") {
    return { ok: false, error: "Você não pode remover seu próprio papel ADMIN" };
  }

  // Se mudou email, validar unicidade no tenant
  if (target.email.toLowerCase() !== email) {
    const conflict = await findUserByEmailInTenant(session.user.tenantId, email);
    if (conflict && conflict.id !== id) {
      return { ok: false, error: "Já existe outro usuário com este e-mail" };
    }
  }

  try {
    const count = await updateUserInTenant(session.user.tenantId, id, {
      name,
      email,
      role: role as Role,
    });
    if (count === 0) return { ok: false, error: "Usuário não atualizado" };

    const { ip, userAgent } = await getRequestMeta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "user.update",
      entity: "User",
      entityId: id,
      meta: {
        before: { name: target.name, email: target.email, role: target.role },
        after: { name, email, role },
      },
      ip,
      userAgent,
    });

    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar usuário";
    return { ok: false, error: message };
  }
}

// ───────────────────────── Ativar/Desativar ──────────────────────────────

export async function setUsuarioAtivo(input: {
  id: string;
  active: boolean;
}): Promise<SimpleResult> {
  const guard = await requireRole(ROLES_ADMIN);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const id = input.id?.trim();
  if (!id) return { ok: false, error: "ID obrigatório" };

  const target = await findUserInTenant(session.user.tenantId, id);
  if (!target) return { ok: false, error: "Usuário não encontrado" };

  if (target.id === session.user.id && !input.active) {
    return { ok: false, error: "Você não pode desativar a si mesmo" };
  }

  try {
    const count = await updateUserInTenant(session.user.tenantId, id, {
      active: input.active,
    });
    if (count === 0) return { ok: false, error: "Usuário não atualizado" };

    const { ip, userAgent } = await getRequestMeta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: input.active ? "user.activate" : "user.deactivate",
      entity: "User",
      entityId: id,
      meta: { name: target.name, email: target.email },
      ip,
      userAgent,
    });

    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao alterar status";
    return { ok: false, error: message };
  }
}

// ───────────────────────── Resetar senha ─────────────────────────────────

export async function resetarSenha(input: {
  id: string;
  password: string;
}): Promise<SimpleResult> {
  const guard = await requireRole(ROLES_ADMIN);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const id = input.id?.trim();
  if (!id) return { ok: false, error: "ID obrigatório" };

  const pwCheck = validatePassword(input.password);
  if (!pwCheck.ok) return { ok: false, error: pwCheck.error ?? "Senha inválida" };

  const target = await findUserInTenant(session.user.tenantId, id);
  if (!target) return { ok: false, error: "Usuário não encontrado" };

  try {
    const hash = await hashPassword(input.password);
    const count = await setPasswordHashInTenant(session.user.tenantId, id, hash);
    if (count === 0) return { ok: false, error: "Senha não atualizada" };

    const { ip, userAgent } = await getRequestMeta();
    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "user.password_reset",
      entity: "User",
      entityId: id,
      meta: { name: target.name, email: target.email },
      ip,
      userAgent,
    });

    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao resetar senha";
    return { ok: false, error: message };
  }
}
