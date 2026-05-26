"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireRole, requireAuth, ROLES_MANAGE } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { criarPrazoEng } from "@/lib/services/prazoEngenhariaIND21";
import { upsertObservacaoPV, deleteObservacaoPV } from "@/lib/services/observacaoPV";

const OBS_MAX_LEN = 1000;

export interface RegistrarPrazoInput {
  numPedido: string;
  dataPrazo: string; // ISO yyyy-mm-dd
  observacao?: string | null;
}

export type RegistrarPrazoResult =
  | { ok: true; id: string; dataPrazo: string }
  | { ok: false; error: string };

/**
 * Registra um novo prazo de engenharia para um PV da unidade IND21 (Ergomec).
 * Sempre INSERT — preserva histórico completo.
 *
 * Permissão: ADMIN, DIRETOR ou GERENTE (ROLES_MANAGE).
 *
 * Validações cross-tenant:
 *  - Verifica que existe ao menos um Pedido com (tenantId, numPedido,
 *    unidadeNegocio = "IND21") — impede registrar prazo para PV de outro
 *    tenant ou para PV não-Ergomec.
 */
export async function registrarPrazoEngenharia(
  input: RegistrarPrazoInput,
): Promise<RegistrarPrazoResult> {
  const guard = await requireRole(ROLES_MANAGE);
  if (guard.error) return { ok: false, error: "Sem permissão" };
  const session = guard.session;

  const numPedido = input.numPedido?.trim();
  if (!numPedido) return { ok: false, error: "Número do PV obrigatório" };

  const data = parseDateInput(input.dataPrazo);
  if (!data) return { ok: false, error: "Data inválida" };

  const observacao = input.observacao?.trim() || null;
  if (observacao && observacao.length > 500) {
    return { ok: false, error: "Observação muito longa (máx 500 chars)" };
  }

  // Validação cross-tenant: PV precisa existir no tenant E ser IND21
  const pvExiste = await prisma.pedido.findFirst({
    where: {
      tenantId: session.user.tenantId,
      numPedido,
      unidadeNegocio: "IND21",
    },
    select: { id: true },
  });
  if (!pvExiste) {
    return { ok: false, error: "PV não encontrado ou não é da unidade IND21" };
  }

  try {
    const created = await criarPrazoEng({
      tenantId: session.user.tenantId,
      numPedido,
      dataPrazo: data,
      observacao,
      criadoPor: session.user.id,
    });

    const hdr = await headers();
    const ip = hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip");
    const userAgent = hdr.get("user-agent");

    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "prazoEngIND21.create",
      entity: "PrazoEngenhariaIND21",
      entityId: created.id,
      meta: {
        numPedido,
        dataPrazo: created.dataPrazo.toISOString(),
        observacao,
      },
      ip,
      userAgent,
    });

    revalidatePath("/prontidao");

    return {
      ok: true,
      id: created.id,
      dataPrazo: created.dataPrazo.toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao registrar prazo";
    return { ok: false, error: message };
  }
}

export interface SalvarObservacaoInput {
  numPedido: string;
  texto: string;
}

export type SalvarObservacaoResult =
  | { ok: true; removed: boolean; atualizadoEm: string | null }
  | { ok: false; error: string };

/**
 * Cria/atualiza/remove a observação geral de um PV (visível nas tabelas de
 * Prontidão). Texto vazio remove o registro.
 *
 * Permissão: qualquer usuário logado. Multi-tenant garantido via sessão +
 * validação de que o PV existe no tenant.
 */
export async function salvarObservacaoPV(
  input: SalvarObservacaoInput,
): Promise<SalvarObservacaoResult> {
  const guard = await requireAuth();
  if (guard.error) return { ok: false, error: "Não autenticado" };
  const session = guard.session!;

  const numPedido = input.numPedido?.trim();
  if (!numPedido) return { ok: false, error: "Número do PV obrigatório" };

  const texto = input.texto?.trim() ?? "";
  if (texto.length > OBS_MAX_LEN) {
    return { ok: false, error: `Observação muito longa (máx ${OBS_MAX_LEN} chars)` };
  }

  // Validação cross-tenant: PV precisa existir no tenant (qualquer unidade).
  const pvExiste = await prisma.pedido.findFirst({
    where: { tenantId: session.user.tenantId, numPedido },
    select: { id: true },
  });
  if (!pvExiste) return { ok: false, error: "PV não encontrado" };

  const hdr = await headers();
  const ip = hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip");
  const userAgent = hdr.get("user-agent");

  try {
    if (texto === "") {
      await deleteObservacaoPV({ tenantId: session.user.tenantId, numPedido });
      await logAudit({
        tenantId: session.user.tenantId,
        userId: session.user.id,
        action: "observacaoPV.delete",
        entity: "ObservacaoPV",
        meta: { numPedido },
        ip,
        userAgent,
      });
      revalidatePath("/prontidao");
      return { ok: true, removed: true, atualizadoEm: null };
    }

    const saved = await upsertObservacaoPV({
      tenantId: session.user.tenantId,
      numPedido,
      texto,
      atualizadoPor: session.user.id,
    });

    await logAudit({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      action: "observacaoPV.upsert",
      entity: "ObservacaoPV",
      entityId: saved.id,
      meta: { numPedido, len: texto.length },
      ip,
      userAgent,
    });

    revalidatePath("/prontidao");
    return { ok: true, removed: false, atualizadoEm: saved.atualizadoEm.toISOString() };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao salvar observação";
    return { ok: false, error: message };
  }
}

function parseDateInput(s: string | undefined | null): Date | null {
  if (!s) return null;
  // Aceita "YYYY-MM-DD" do <input type="date">
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}
